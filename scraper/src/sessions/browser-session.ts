import type { ChromeBrowser } from "../browser/chrome-browser";

/** `exclusive`: one task has the page to itself (e.g. solving a challenge); searches skip it. */
export type BrowserSessionState = "ready" | "exclusive" | "retired";

/**
 * One warmed browser (one sticky proxy IP) plus its usage counters.
 * A retired session takes no new work and closes once its in-flight searches end.
 */
export class BrowserSession {
  state: BrowserSessionState = "ready";
  inflight = 0;
  /** Requests sent to Skyscanner through this session (lookups + search API calls). */
  upstreamRequests = 0;
  readonly startedAt = Date.now();
  /** When a search last took this session; ties in `acquire` go to the least recently used. */
  lastUsedAt = 0;
  /** Moving average of one Skyscanner request through this session's proxy IP. */
  latencyMs = 0;
  latencySamples = 0;
  private closing?: Promise<void>;

  constructor(
    readonly id: string,
    readonly browser: ChromeBrowser,
  ) {}

  get isUsable(): boolean {
    return this.state === "ready" && this.browser.isAlive;
  }

  /** Runs `work` while counting it as in-flight on this session. */
  async run<T>(work: (browser: ChromeBrowser) => Promise<T>): Promise<T> {
    this.inflight++;
    this.lastUsedAt = Date.now();
    try {
      return await work(this.browser);
    } finally {
      this.inflight--;
      if (this.state === "retired" && this.inflight === 0) void this.close();
    }
  }

  recordLatency(ms: number): void {
    this.latencyMs = this.latencySamples ? Math.round((this.latencyMs + ms) / 2) : ms;
    this.latencySamples++;
  }

  retire(): void {
    this.state = "retired";
    if (this.inflight === 0) void this.close();
  }

  close(): Promise<void> {
    return (this.closing ??= this.browser.close().catch(() => undefined));
  }
}
