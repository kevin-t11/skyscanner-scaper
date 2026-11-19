/**
 * Compact line logger: `17:21:05.123 INFO  [req 3f9a1c +1.84s] poll 3 · 284 flights (+141)`.
 * `timed` loggers prefix the seconds elapsed since they were created.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export const parseLogLevel = (value: string | undefined): LogLevel =>
  value && value in LEVEL_RANK ? (value as LogLevel) : "info";

let minimumLevel: LogLevel = parseLogLevel(process.env.LOG_LEVEL);

export function setLogLevel(level: LogLevel): void {
  minimumLevel = level;
}

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  /** Milliseconds since a timed logger was created. */
  elapsedMs(): number;
}

const clockTime = (date: Date) =>
  `${date.toTimeString().slice(0, 8)}.${String(date.getMilliseconds()).padStart(3, "0")}`;

export function createLogger(scope: string, options: { timed?: boolean } = {}): Logger {
  const startedAt = performance.now();
  const elapsedMs = () => Math.round(performance.now() - startedAt);

  const write = (level: LogLevel, message: string) => {
    if (LEVEL_RANK[level] < LEVEL_RANK[minimumLevel]) return;
    const elapsed = options.timed ? ` +${(elapsedMs() / 1000).toFixed(2)}s` : "";
    const line = `${clockTime(new Date())} ${level.toUpperCase().padEnd(5)} [${scope}${elapsed}] ${message}`;
    (level === "error" || level === "warn" ? console.error : console.log)(line);
  };

  return {
    debug: (message) => write("debug", message),
    info: (message) => write("info", message),
    warn: (message) => write("warn", message),
    error: (message) => write("error", message),
    elapsedMs,
  };
}

/** `1234` → `1.23s`, `850` → `850ms`. */
export const formatDuration = (ms: number) => (ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`);
