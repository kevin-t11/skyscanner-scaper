/** Runtime configuration, read once from the environment. */
import { parseLogLevel, type LogLevel } from "../logging/logger";

export interface AppConfig {
  port: number;
  /** Interface to listen on; localhost by default because every search spends proxy bandwidth. */
  hostname: string;
  /** When set, `/url` requires `x-api-key: <apiKey>`. */
  apiKey: string | undefined;
  /** Browser sessions in the pool (one Chrome and one sticky proxy IP each). */
  poolSize: number;
  /** `http://user:pass@host:port`; `{session}` is replaced with a per-browser id. */
  proxyUrl: string | undefined;
  chromePath: string;
  headless: boolean;
  /** Skyscanner site the sessions use, e.g. `www.skyscanner.co.in`. */
  skyscannerHost: string;
  market: string;
  locale: string;
  currency: string;
  /** Upper bound for one search, including all polls. */
  searchDeadlineMs: number;
  /** Where each `/url` response is saved as JSON; `undefined` disables saving. */
  outputDir: string | undefined;
  logLevel: LogLevel;
}

type Env = Record<string, string | undefined>;

const positiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function loadAppConfig(env: Env = process.env): AppConfig {
  return {
    port: positiveInt(env.PORT, 8080),
    hostname: env.HOST || "127.0.0.1",
    apiKey: env.API_KEY || undefined,
    poolSize: positiveInt(env.POOL_SIZE, 2),
    proxyUrl: env.PROXY_URL || undefined,
    chromePath: env.CHROME_PATH || "google-chrome",
    headless: env.HEADLESS === "true",
    skyscannerHost: env.SKYSCANNER_HOST || "www.skyscanner.com",
    market: env.MARKET || "US",
    locale: env.LOCALE || "en-US",
    currency: env.CURRENCY || "USD",
    searchDeadlineMs: positiveInt(env.SEARCH_DEADLINE_MS, 12_000),
    // Unset → ./output; set to an empty string to disable saving.
    outputDir: env.OUTPUT_DIR === undefined ? "output" : env.OUTPUT_DIR || undefined,
    logLevel: parseLogLevel(env.LOG_LEVEL),
  };
}
