/**
 * A pool of warmed browser sessions. One session = one Chrome + one sticky
 * proxy IP. A session is retired on its first PerimeterX rejection and
 * replaced in the background, so healthy capacity keeps serving.
 */
import { Browser, parseProxyUrl } from "./browser";
import type { Config } from "./config";

export type SessionState = "starting" | "ready" | "retired";

export class Session {
  state: SessionState = "starting";
  inflight = 0;
  requests = 0;
  readonly startedAt = Date.now();

  constructor(
    readonly id: string,
    readonly browser: Browser,
  ) {}

  /** Runs `fn` while counting it as in-flight work on this session. */
  async use<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
    this.inflight++;
    try {
      return await fn(this.browser);
    } finally {
      this.inflight--;
    }
  }
}

export class NoSessionAvailable extends Error {}

const RETRY_BACKOFF_MS = [1_000, 5_000, 15_000, 60_000];

export class SessionPool {
  private readonly sessions = new Set<Session>();
  private readonly waiters = new Set<() => void>();
  private launchFailures = 0;
  private stopped = false;
  private stats = { launched: 0, retired: 0, launchErrors: 0 };

  constructor(private readonly config: Config) {}

  get origin(): string {
    return `https://${this.config.host}`;
  }

  /** Starts `poolSize` sessions in the background; resolves when the first one is ready. */
  async start(): Promise<void> {
    const first = new Promise<void>((resolve) => this.waiters.add(resolve));
    for (let i = 0; i < this.config.poolSize; i++) void this.spawn();
    await first;
  }

  /** Least-busy ready session, waiting up to `timeoutMs` for one to become ready. */
  async acquire(timeoutMs = 30_000): Promise<Session> {
    const deadline = Date.now() + timeoutMs;
    while (!this.stopped) {
      const ready = [...this.sessions].filter((s) => s.state === "ready" && s.browser.alive);
      if (ready.length) return ready.reduce((a, b) => (b.inflight < a.inflight ? b : a));
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, remaining);
        const waiter = () => done();
        function done() {
          clearTimeout(timer);
          resolve();
        }
        this.waiters.add(waiter);
      });
    }
    throw new NoSessionAvailable("no browser session is ready");
  }

  /** Retires a rejected session and launches a replacement with a new proxy IP. */
  retire(session: Session, reason: string): void {
    if (session.state === "retired") return;
    session.state = "retired";
    this.sessions.delete(session);
    this.stats.retired++;
    console.warn(`[pool] retired ${session.id} after ${session.requests} requests: ${reason}`);
    void session.browser.close();
    if (!this.stopped) void this.spawn();
  }

  health() {
    const sessions = [...this.sessions].map((s) => ({
      id: s.id,
      state: s.state,
      inflight: s.inflight,
      requests: s.requests,
      ageSeconds: Math.round((Date.now() - s.startedAt) / 1000),
    }));
    return { ready: sessions.filter((s) => s.state === "ready").length, size: this.config.poolSize, ...this.stats, sessions };
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.notify();
    await Promise.all([...this.sessions].map((s) => s.browser.close()));
    this.sessions.clear();
  }

  private async spawn(): Promise<void> {
    const id = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const backoff = RETRY_BACKOFF_MS[Math.min(this.launchFailures, RETRY_BACKOFF_MS.length - 1)]!;
    if (this.launchFailures) await Bun.sleep(backoff);
    if (this.stopped) return;

    let browser: Browser | undefined;
    try {
      const { config } = this;
      browser = await Browser.launch({
        chromePath: config.chromePath,
        headless: config.headless,
        locale: config.locale,
        proxy: config.proxyUrl ? parseProxyUrl(config.proxyUrl.replaceAll("{session}", id)) : undefined,
      });
      // Landing on the home page lets PerimeterX's sensor run and set its cookies.
      // A captcha page is still a usable origin: the sensor runs there too.
      await browser.goto(`${this.origin}/`);
      if (this.stopped) return void (await browser.close());

      const session = new Session(id, browser);
      session.state = "ready";
      this.sessions.add(session);
      this.launchFailures = 0;
      this.stats.launched++;
      console.info(`[pool] session ${id} ready`);
      this.notify();
    } catch (error) {
      this.launchFailures++;
      this.stats.launchErrors++;
      console.error(`[pool] session ${id} failed to start: ${(error as Error).message}`);
      await browser?.close().catch(() => undefined);
      if (!this.stopped) void this.spawn();
    }
  }

  private notify(): void {
    for (const waiter of this.waiters) waiter();
    this.waiters.clear();
  }
}
