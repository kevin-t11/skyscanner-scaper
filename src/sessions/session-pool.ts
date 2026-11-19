/**
 * Pool of warmed browser sessions. A session is retired on its first
 * PerimeterX rejection (or when Chrome exits) and replaced in the background
 * with a new proxy IP, so healthy capacity keeps serving.
 */
import { ChromeBrowser } from "../browser/chrome-browser";
import { proxyForSession } from "../browser/proxy-settings";
import type { AppConfig } from "../config/app-config";
import { NoSessionAvailableError } from "../errors";
import { BrowserSession } from "./browser-session";

const LAUNCH_RETRY_BACKOFF_MS = [1_000, 5_000, 15_000, 60_000];
const DEFAULT_ACQUIRE_TIMEOUT_MS = 30_000;

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

  /** `https://<SKYSCANNER_HOST>`: the origin every session's page is on. */
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

  /** Retires a session and launches a replacement with a new proxy IP. */
  retire(session: BrowserSession, reason: string): void {
    if (!this.sessions.delete(session)) return;
    session.retire();
    this.counters.retired++;
    console.warn(`[pool] retired ${session.id} after ${session.upstreamRequests} requests: ${reason}`);
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
    try {
      const { config } = this;
      browser = await ChromeBrowser.launch({
        chromePath: config.chromePath,
        headless: config.headless,
        locale: config.locale,
        proxy: proxyForSession(config.proxyUrl, id),
      });
      this.warmingBrowsers.add(browser);
      if (this.stopped) throw new Error("pool stopped");
      // Landing on the home page lets PerimeterX's sensor run and set its cookies.
      // A captcha page is still a usable origin: the sensor runs there too.
      await browser.navigate(`${this.origin}/`);
      this.warmingBrowsers.delete(browser);
      if (this.stopped) throw new Error("pool stopped");

      this.sessions.add(new BrowserSession(id, browser));
      this.consecutiveLaunchFailures = 0;
      this.counters.launched++;
      console.info(`[pool] session ${id} ready`);
      this.notifyReady();
    } catch (error) {
      if (browser) {
        this.warmingBrowsers.delete(browser);
        await browser.close().catch(() => undefined);
      }
      if (this.stopped) return;
      this.consecutiveLaunchFailures++;
      this.counters.launchErrors++;
      console.error(`[pool] session ${id} failed to start: ${(error as Error).message}`);
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
