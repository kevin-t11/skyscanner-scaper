/**
 * Pool of warmed browser sessions. A session is retired on its first
 * PerimeterX rejection (or when Chrome exits) and replaced in the background
 * with a new proxy IP, so healthy capacity keeps serving.
 */
import { ChromeBrowser } from "../browser/chrome-browser";
import { proxyForSession } from "../browser/proxy-settings";
import type { AppConfig } from "../config/app-config";
import { NoSessionAvailableError } from "../errors";
import { createLogger, formatDuration } from "../logging/logger";
import { isChallengeUrl, solvePressAndHold } from "../skyscanner/px-challenge";
import { BrowserSession } from "./browser-session";

const LAUNCH_RETRY_BACKOFF_MS = [1_000, 5_000, 15_000, 60_000];
const DEFAULT_ACQUIRE_TIMEOUT_MS = 30_000;
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
}

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

  constructor(private readonly config: AppConfig) {}

  /** The Skyscanner origin every session's page is on. */
  get origin(): string {
    return `https://${this.config.skyscannerHost}`;
  }

  private get stopped(): boolean {
    return this.shutdown.signal.aborted;
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
      if (usable.length) return usable.reduce((a, b) => (b.inflight < a.inflight ? b : a));
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

  /** Records a search that passed; kept on the pool so it survives session replacement. */
  recordSuccess(): void {
    this.lastSuccessAt = Date.now();
  }

  /** Retires a session and launches a replacement with a new proxy IP. */
  retire(session: BrowserSession, reason: string): void {
    if (!this.sessions.delete(session)) return;
    session.retire();
    this.counters.retired++;
    this.lastError = `session retired: ${reason}`;
    log.warn(`session ${session.id} retired after ${session.upstreamRequests} requests: ${reason}`);
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
    log.info(`session ${id} launching${config.proxyUrl ? " via proxy" : " without proxy"}`);
    try {
      browser = await ChromeBrowser.launch({
        chromePath: config.chromePath,
        headless: config.headless,
        locale: config.locale,
        proxy: proxyForSession(config.proxyUrl, id),
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
      this.warmingBrowsers.delete(browser);
      if (this.stopped) throw new Error("pool stopped");

      this.sessions.add(new BrowserSession(id, browser));
      this.consecutiveLaunchFailures = 0;
      this.counters.launched++;
      log.info(`session ${id} ready in ${formatDuration(performance.now() - launchStartedAt)} (${this.sessions.size}/${config.poolSize} ready)`);
      this.notifyReady();
    } catch (error) {
      if (browser) {
        this.warmingBrowsers.delete(browser);
        await browser.close().catch(() => undefined);
      }
      if (this.stopped) return;
      this.consecutiveLaunchFailures++;
      this.counters.launchErrors++;
      this.lastError = `launch failed: ${(error as Error).message}`;
      log.error(`session ${id} failed to start: ${(error as Error).message}`);
      this.launchInBackground();
    }
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
