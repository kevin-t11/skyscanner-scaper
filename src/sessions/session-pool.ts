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

export interface PoolHealth {
  ready: number;
  warming: number;
  size: number;
  launched: number;
  retired: number;
  launchErrors: number;
  sessions: { id: string; inflight: number; upstreamRequests: number; ageSeconds: number }[];
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

  /** Retires a session and launches a replacement with a new proxy IP. */
  retire(session: BrowserSession, reason: string): void {
    if (!this.sessions.delete(session)) return;
    session.retire();
    this.counters.retired++;
    log.warn(`session ${session.id} retired after ${session.upstreamRequests} requests: ${reason}`);
    if (!this.stopped) this.launchInBackground();
  }

  health(): PoolHealth {
    const sessions = [...this.sessions].map((session) => ({
      id: session.id,
      inflight: session.inflight,
      upstreamRequests: session.upstreamRequests,
      ageSeconds: Math.round((Date.now() - session.startedAt) / 1000),
    }));
    return { ready: sessions.length, warming: this.warmingBrowsers.size, size: this.config.poolSize, ...this.counters, sessions };
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
      // An unsolved challenge page is still a usable origin: the sensor runs there too.
      if (isChallengeUrl(landedUrl)) await solvePressAndHold(browser, createLogger(`session ${id}`));
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
