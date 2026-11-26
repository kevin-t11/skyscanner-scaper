/**
 * Pool of warmed browser sessions. A session is retired on its first
 * PerimeterX rejection, when Chrome exits or when its proxy turns slow, and
 * replaced in the background with a new proxy IP. Healthy sessions are kept
 * for good: a new one costs ~1.3 MB of proxy traffic to warm up.
 */
import { availableParallelism, loadavg } from "node:os";
import { ChromeBrowser } from "../browser/chrome-browser";
import { proxyForSession } from "../browser/proxy-settings";
import type { AppConfig } from "../config/app-config";
import { NoSessionAvailableError } from "../errors";
import { createLogger, formatDuration } from "../utils/logger";
import { isChallengeUrl, solvePressAndHold } from "../skyscanner/px-challenge";
import { BrowserSession } from "./browser-session";

const LAUNCH_RETRY_BACKOFF_MS = [1_000, 5_000, 15_000, 60_000];
const DEFAULT_ACQUIRE_TIMEOUT_MS = 30_000;
/** A session whose requests average this slow, and 2x slower than the pool, is replaced. */
const SLOW_REQUEST_MS = 3_000;
/** A `{slot}` IP whose browser was blocked or retired rests this long before it is used again. */
const SLOT_COOLDOWN_MS = 30 * 60_000;
const log = createLogger("pool");

/** `GET /health` body, shaped like the Zillow scraper's: a status plus pool counters. */
export interface PoolHealth {
  /** `ok`: a browser is ready · `warming`: one is starting · `no-browsers`: none is ready or starting. */
  status: "ok" | "warming" | "no-browsers";
  size: number;
  live: number;
  warming: number;
  launched: number;
  retired: number;
  launch_errors: number;
  last_error: string | null;
  oldest_session_age_s: number | null;
  /** ISO time of the last search that passed. */
  last_success_at: string | null;
  proxy: boolean;
  /** Present when `PROXY_URL` uses `{slot}`. */
  proxy_slots?: { total: number; in_use: number; cooling: number; fallback_sessions: number };
}

/** The proxy a session was launched on: a numbered `{slot}` IP, the fallback proxy, or the plain `PROXY_URL`. */
type ProxyChoice = { url: string | undefined; slot?: number; fallback?: boolean };

export class SessionPool {
  private readonly sessions = new Set<BrowserSession>();
  /** Browsers launched but still on their warm-up navigation; closed on stop. */
  private readonly warmingBrowsers = new Set<ChromeBrowser>();
  private readonly pendingLaunches = new Set<Promise<void>>();
  private readonly readyListeners = new Set<() => void>();
  private readonly shutdown = new AbortController();
  private consecutiveLaunchFailures = 0;
  private readonly counters = { launched: 0, retired: 0, launchErrors: 0 };
  private lastError: string | null = null;
  private lastSuccessAt: number | null = null;
  private readonly sessionProxies = new Map<BrowserSession, ProxyChoice>();
  private readonly sessionSearches = new Map<BrowserSession, number>();
  /** Browsers per `{slot}` IP; more than one only when the pool outnumbers the slots and there is no fallback. */
  private readonly slotUsers = new Map<number, number>();
  private readonly slotCoolUntil = new Map<number, number>();
  private nextSlot = 1;
  /** Runs on each new session before it takes searches; a throw fails the launch, so a blocked IP never serves one. */
  private warmUp?: (session: BrowserSession) => Promise<void>;

  constructor(private readonly config: AppConfig) {}

  /** The Skyscanner origin every session's page is on. */
  get origin(): string {
    return `https://${this.config.skyscannerHost}`;
  }

  private get stopped(): boolean {
    return this.shutdown.signal.aborted;
  }

  setWarmUp(warmUp: (session: BrowserSession) => Promise<void>): void {
    this.warmUp = warmUp;
  }

  /** Launches `poolSize` sessions in the background; resolves when the first is ready. */
  async start(): Promise<void> {
    const firstReady = this.waitForReadySession();
    for (let i = 0; i < this.config.poolSize; i++) this.launchInBackground();
    await firstReady;
  }

  /** The least-busy usable session, waiting up to `timeoutMs` for one to become ready. */
  async acquire(timeoutMs = DEFAULT_ACQUIRE_TIMEOUT_MS): Promise<BrowserSession> {
    const deadline = Date.now() + timeoutMs;
    while (!this.stopped) {
      for (const session of this.sessions) {
        if (!session.browser.isAlive) this.retire(session, "Chrome exited");
      }
      const usable = [...this.sessions].filter((session) => session.isUsable);
      if (usable.length) {
        return usable.reduce((a, b) =>
          b.inflight < a.inflight || (b.inflight === a.inflight && b.lastUsedAt < a.lastUsedAt) ? b : a,
        );
      }
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      await this.waitForReadySession(remainingMs);
    }
    throw new NoSessionAvailableError("no browser session is ready");
  }

  /**
   * Runs `work` with the session's page to itself: only when no search is using it, and no new
   * search gets it until `work` ends. Returns false when the session is busy or `work` fails; then the caller must retire it.
   */
  /** True when another warm session could take a search right away (retrying there beats solving). */
  hasOtherReadySession(session: BrowserSession): boolean {
    return [...this.sessions].some((other) => other !== session && other.isUsable);
  }

  async runExclusive(session: BrowserSession, work: (browser: ChromeBrowser) => Promise<boolean>): Promise<boolean> {
    if (!session.isUsable || session.inflight > 0) return false;
    session.state = "exclusive";
    const succeeded = await session.run(work).catch(() => false);
    // On failure the session stays out of rotation; the caller retires it.
    if (succeeded && session.state === "exclusive") {
      session.state = "ready";
      this.notifyReady();
    }
    return succeeded;
  }

  /** Records a search that passed; after `proxyRotateAfter` searches a `{slot}` or fallback browser moves to the next free IP. */
  recordSuccess(session: BrowserSession): void {
    this.lastSuccessAt = Date.now();
    if (!this.sessions.has(session)) return;
    const searches = (this.sessionSearches.get(session) ?? 0) + 1;
    this.sessionSearches.set(session, searches);
    const { proxyRotateAfter } = this.config;
    const proxy = this.sessionProxies.get(session);
    // Only when the replacement can get a different IP; otherwise the healthy browser would just restart on the same one.
    const canMove = (proxy?.slot || proxy?.fallback) && this.freeSlot() !== undefined;
    if (proxyRotateAfter && searches >= proxyRotateAfter && canMove) {
      this.retire(session, `rotating to a new IP after ${searches} searches`, { coolSlot: false });
    }
  }

  /** Replaces a session whose proxy IP has become much slower than the rest of the pool. */
  recordLatency(session: BrowserSession, avgRequestMs: number): void {
    if (!avgRequestMs) return;
    session.recordLatency(avgRequestMs);
    if (session.latencySamples < 2 || session.latencyMs < SLOW_REQUEST_MS) return;
    const others = [...this.sessions]
      .filter((other) => other !== session && other.latencySamples > 0)
      .map((other) => other.latencyMs)
      .sort((a, b) => a - b);
    const typicalMs = others[Math.floor(others.length / 2)];
    if (typicalMs === undefined || session.latencyMs < typicalMs * 2) return;
    if (!this.hasOtherReadySession(session)) return;
    // On a saturated CPU every request looks slow; replacing the browser would only spend proxy traffic.
    if ((loadavg()[0] ?? 0) >= availableParallelism()) return;
    this.retire(session, `slow proxy: ${session.latencyMs} ms per request`);
  }

  /** Retires a session and launches a replacement with a new proxy IP. */
  retire(session: BrowserSession, reason: string, { coolSlot = true } = {}): void {
    if (!this.sessions.delete(session)) return;
    this.releaseProxy(this.sessionProxies.get(session), coolSlot && reason !== "Chrome exited");
    this.sessionProxies.delete(session);
    this.sessionSearches.delete(session);
    session.retire();
    this.counters.retired++;
    log.warn(`session ${session.id} retired after ${session.upstreamRequests} requests: ${reason}`);
    this.lastError = `session retired: ${reason}`;
    if (!this.stopped) this.launchInBackground();
  }

  health(): PoolHealth {
    const sessions = [...this.sessions];
    const warming = this.warmingBrowsers.size;
    const oldestStartedAt = Math.min(...sessions.map((session) => session.startedAt));
    return {
      status: sessions.length ? "ok" : warming ? "warming" : "no-browsers",
      size: this.config.poolSize,
      live: sessions.length,
      warming,
      launched: this.counters.launched,
      retired: this.counters.retired,
      launch_errors: this.counters.launchErrors,
      last_error: this.lastError,
      oldest_session_age_s: sessions.length ? Math.round((Date.now() - oldestStartedAt) / 100) / 10 : null,
      last_success_at: this.lastSuccessAt ? new Date(this.lastSuccessAt).toISOString() : null,
      proxy: Boolean(this.config.proxyUrl),
      ...(this.config.proxySlots && {
        proxy_slots: {
          total: this.config.proxySlots,
          in_use: this.slotUsers.size,
          cooling: [...this.slotCoolUntil.values()].filter((until) => until > Date.now()).length,
          fallback_sessions: [...this.sessionProxies.values()].filter((choice) => choice.fallback).length,
        },
      }),
    };
  }

  async stop(): Promise<void> {
    this.shutdown.abort();
    this.notifyReady();
    await Promise.all([...this.warmingBrowsers].map((browser) => browser.close().catch(() => undefined)));
    await Promise.all(this.pendingLaunches);
    await Promise.all([...this.sessions].map((session) => session.close()));
    this.sessions.clear();
  }

  private launchInBackground(): void {
    const launch = this.launchSession().finally(() => this.pendingLaunches.delete(launch));
    this.pendingLaunches.add(launch);
  }

  private async launchSession(): Promise<void> {
    const id = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    if (this.consecutiveLaunchFailures) await this.backoff();
    if (this.stopped) return;

    let browser: ChromeBrowser | undefined;
    const launchStartedAt = performance.now();
    const { config } = this;
    const proxy = this.pickProxy();
    const via = proxy.slot ? ` via proxy slot ${proxy.slot}` : proxy.fallback ? " via fallback proxy" : proxy.url ? " via proxy" : " without proxy";
    log.info(`session ${id} launching${via}`);
    try {
      browser = await ChromeBrowser.launch({
        chromePath: config.chromePath,
        headless: config.headless,
        locale: config.locale,
        proxy: proxyForSession(proxy.url, id, proxy.slot),
      });
      this.warmingBrowsers.add(browser);
      if (this.stopped) throw new Error("pool stopped");
      // Landing on the home page lets PerimeterX's sensor run and set its cookies.
      const landedUrl = await browser.navigate(`${this.origin}/`);
      const landedOn = new URL(landedUrl).host;
      // Some proxy IPs are redirected to another market (e.g. www.skyscanner.com, priced in USD).
      if (landedOn !== config.skyscannerHost) throw new Error(`redirected to ${landedOn}`);
      // An unsolved (or timed-out) challenge must not be published: its solver may still drive the page.
      if (isChallengeUrl(landedUrl) && !(await solvePressAndHold(browser, createLogger(`session ${id}`)))) {
        throw new Error("challenge page not solved");
      }
      const session = new BrowserSession(id, browser);
      if (this.warmUp) await this.warmUp(session);
      this.warmingBrowsers.delete(browser);
      if (this.stopped) throw new Error("pool stopped");

      this.sessions.add(session);
      this.sessionProxies.set(session, proxy);
      this.consecutiveLaunchFailures = 0;
      this.counters.launched++;
      log.info(`session ${id} ready in ${formatDuration(performance.now() - launchStartedAt)} (${this.sessions.size}/${config.poolSize} ready)`);
      this.notifyReady();
    } catch (error) {
      if (browser) {
        this.warmingBrowsers.delete(browser);
        await browser.close().catch(() => undefined);
      }
      this.releaseProxy(proxy, true);
      if (this.stopped) return;
      this.consecutiveLaunchFailures++;
      this.counters.launchErrors++;
      this.lastError = `launch failed: ${(error as Error).message}`;
      log.error(`session ${id} failed to start: ${(error as Error).message}`);
      this.launchInBackground();
    }
  }

  /** The next free `{slot}` IP not cooling down (round-robin), else the fallback proxy, else the least-used slot. */
  private pickProxy(): ProxyChoice {
    const { proxyUrl, proxySlots, fallbackProxyUrl } = this.config;
    if (!proxySlots) return { url: proxyUrl };
    let slot = this.freeSlot();
    if (slot === undefined) {
      if (fallbackProxyUrl) return { url: fallbackProxyUrl, fallback: true };
      const users = (candidate: number) => this.slotUsers.get(candidate) ?? 0;
      const coolUntil = (candidate: number) => this.slotCoolUntil.get(candidate) ?? 0;
      slot = this.slotOrder().sort((a, b) => users(a) - users(b) || coolUntil(a) - coolUntil(b))[0]!;
    }
    this.slotUsers.set(slot, (this.slotUsers.get(slot) ?? 0) + 1);
    this.nextSlot = (slot % proxySlots) + 1;
    return { url: proxyUrl, slot };
  }

  /** Slots in round-robin order, starting after the last one handed out. */
  private slotOrder(): number[] {
    const { proxySlots } = this.config;
    return Array.from({ length: proxySlots }, (_, i) => ((this.nextSlot - 1 + i) % proxySlots) + 1);
  }

  /** A slot no browser uses and that is not cooling down. */
  private freeSlot(): number | undefined {
    const now = Date.now();
    return this.slotOrder().find((slot) => !this.slotUsers.has(slot) && (this.slotCoolUntil.get(slot) ?? 0) <= now);
  }

  private releaseProxy(choice: ProxyChoice | undefined, cool: boolean): void {
    if (!choice?.slot) return;
    const users = (this.slotUsers.get(choice.slot) ?? 1) - 1;
    if (users > 0) this.slotUsers.set(choice.slot, users);
    else this.slotUsers.delete(choice.slot);
    if (cool) this.slotCoolUntil.set(choice.slot, Date.now() + SLOT_COOLDOWN_MS);
  }

  /** Sleeps before a relaunch; ends immediately on stop() and leaves no listener behind. */
  private backoff(): Promise<void> {
    const index = Math.min(this.consecutiveLaunchFailures, LAUNCH_RETRY_BACKOFF_MS.length) - 1;
    const delayMs = LAUNCH_RETRY_BACKOFF_MS[index]!;
    const { signal } = this.shutdown;
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", finish);
        resolve();
      };
      const timer = setTimeout(finish, delayMs);
      signal.addEventListener("abort", finish);
    });
  }

  /** Resolves when a session becomes ready, the pool stops, or `timeoutMs` passes. */
  private waitForReadySession(timeoutMs?: number): Promise<void> {
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        this.readyListeners.delete(finish);
        resolve();
      };
      const timer = timeoutMs === undefined ? undefined : setTimeout(finish, timeoutMs);
      this.readyListeners.add(finish);
    });
  }

  private notifyReady(): void {
    for (const listener of [...this.readyListeners]) listener();
  }
}
