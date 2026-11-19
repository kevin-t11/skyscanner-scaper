/**
 * A pool of warmed browser sessions. One session = one Chrome + one sticky
 * proxy IP. A session is retired on its first PerimeterX rejection (or when
 * Chrome exits) and replaced in the background, so healthy capacity keeps
 * serving. A retired session closes once its in-flight searches finish.
 */
import { Browser, parseProxyUrl } from "./browser";
import type { Config } from "./config";

export type SessionState = "ready" | "retired";

export class Session {
  state: SessionState = "ready";
  inflight = 0;
  requests = 0;
  readonly startedAt = Date.now();
  private closed?: Promise<void>;

  constructor(
    readonly id: string,
    readonly browser: Browser,
  ) {}

  get usable(): boolean {
    return this.state === "ready" && this.browser.alive;
  }

  /** Runs `fn` while counting it as in-flight work on this session. */
  async use<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
    this.inflight++;
    try {
      return await fn(this.browser);
    } finally {
      this.inflight--;
      if (this.state === "retired" && this.inflight === 0) void this.close();
    }
  }

  /** Stops new work; the browser closes when the last in-flight search ends. */
  retire(): void {
    this.state = "retired";
    if (this.inflight === 0) void this.close();
  }

  close(): Promise<void> {
    return (this.closed ??= this.browser.close().catch(() => undefined));
  }
}

export class NoSessionAvailable extends Error {}

const RETRY_BACKOFF_MS = [1_000, 5_000, 15_000, 60_000];

export class SessionPool {
  private readonly sessions = new Set<Session>();
  /** Browsers launched but still warming up; closed on stop. */
  private readonly warming = new Set<Browser>();
  private readonly spawning = new Set<Promise<void>>();
  private readonly waiters = new Set<() => void>();
  private launchFailures = 0;
  private stopped = false;
  /** Resolves on stop(), so launch backoff sleeps end immediately. */
  private readonly stopping = Promise.withResolvers<void>();
  private stats = { launched: 0, retired: 0, launchErrors: 0 };

  constructor(private readonly config: Config) {}

  get origin(): string {
    return `https://${this.config.host}`;
  }

  /** Starts `poolSize` sessions in the background; resolves when the first one is ready. */
  async start(): Promise<void> {
    const first = new Promise<void>((resolve) => {
      const done = () => {
        this.waiters.delete(done);
        resolve();
      };
      this.waiters.add(done);
    });
    for (let i = 0; i < this.config.poolSize; i++) this.spawn();
    await first;
  }

  /** Least-busy ready session, waiting up to `timeoutMs` for one to become ready. */
  async acquire(timeoutMs = 30_000): Promise<Session> {
    const deadline = Date.now() + timeoutMs;
    while (!this.stopped) {
      for (const session of this.sessions) {
        if (!session.browser.alive) this.retire(session, "Chrome exited");
      }
      const ready = [...this.sessions].filter((s) => s.usable);
      if (ready.length) return ready.reduce((a, b) => (b.inflight < a.inflight ? b : a));
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          this.waiters.delete(done);
          resolve();
        };
        const timer = setTimeout(done, remaining);
        this.waiters.add(done);
      });
    }
    throw new NoSessionAvailable("no browser session is ready");
  }

  /** Retires a session and launches a replacement with a new proxy IP. */
  retire(session: Session, reason: string): void {
    if (!this.sessions.delete(session)) return;
    session.retire();
    this.stats.retired++;
    console.warn(`[pool] retired ${session.id} after ${session.requests} requests: ${reason}`);
    if (!this.stopped) this.spawn();
  }

  health() {
    const sessions = [...this.sessions].map((s) => ({
      id: s.id,
      inflight: s.inflight,
      requests: s.requests,
      ageSeconds: Math.round((Date.now() - s.startedAt) / 1000),
    }));
    return { ready: sessions.length, warming: this.warming.size, size: this.config.poolSize, ...this.stats, sessions };
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.stopping.resolve();
    this.notify();
    await Promise.all([...this.warming].map((browser) => browser.close().catch(() => undefined)));
    await Promise.all(this.spawning);
    await Promise.all([...this.sessions].map((s) => s.close()));
    this.sessions.clear();
  }

  private spawn(): void {
    const task = this.launch().finally(() => this.spawning.delete(task));
    this.spawning.add(task);
  }

  private async launch(): Promise<void> {
    const id = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    if (this.launchFailures) {
      const backoff = RETRY_BACKOFF_MS[Math.min(this.launchFailures, RETRY_BACKOFF_MS.length) - 1]!;
      await Promise.race([Bun.sleep(backoff), this.stopping.promise]);
    }
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
      this.warming.add(browser);
      if (this.stopped) throw new Error("pool stopped");
      // Landing on the home page lets PerimeterX's sensor run and set its cookies.
      // A captcha page is still a usable origin: the sensor runs there too.
      await browser.goto(`${this.origin}/`);
      this.warming.delete(browser);
      if (this.stopped) throw new Error("pool stopped");

      this.sessions.add(new Session(id, browser));
      this.launchFailures = 0;
      this.stats.launched++;
      console.info(`[pool] session ${id} ready`);
      this.notify();
    } catch (error) {
      if (browser) {
        this.warming.delete(browser);
        await browser.close().catch(() => undefined);
      }
      if (this.stopped) return;
      this.launchFailures++;
      this.stats.launchErrors++;
      console.error(`[pool] session ${id} failed to start: ${(error as Error).message}`);
      this.spawn();
    }
  }

  private notify(): void {
    for (const waiter of [...this.waiters]) waiter();
  }
}
