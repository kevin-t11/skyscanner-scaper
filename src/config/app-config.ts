/**
 * Runtime configuration. Only what changes between machines comes from the `.env` file
 * (`PROXY_URL`, `PORT`, `POOL_SIZE`, `API_KEY`, `LOGGING`, optional `CHROME_PATH`);
 * everything else is a fixed setting below.
 */
import { existsSync } from "node:fs";
import { parseLoggingEnabled } from "../utils/logger";
import { readDotEnv } from "./dotenv";

/** Skyscanner site and market every session uses; results are priced in this currency. */
export const SKYSCANNER_SITE = { host: "www.skyscanner.co.in", market: "IN", locale: "en-GB", currency: "INR" } as const;

/** Upper bound for one search, including all polls; partial results are returned after it. */
const SEARCH_DEADLINE_MS = 12_000;

/** Where each `/url` response is saved as JSON. */
const OUTPUT_DIR = "output";

/** Used when `CHROME_PATH` is not set: the first one that exists. */
const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

export interface AppConfig {
  port: number;
  /** Always localhost: every search spends proxy bandwidth, so the API is not exposed. */
  hostname: string;
  /** When set, `/url` requires `x-api-key: <apiKey>`. */
  apiKey: string | undefined;
  /** Browser sessions in the pool (one Chrome and one sticky proxy IP each). */
  poolSize: number;
  /** `http://user:pass@host:port`; `{session}` is replaced with a per-browser id. */
  proxyUrl: string | undefined;
  chromePath: string;
  /** Always false: Skyscanner's search API blocks headless Chrome. */
  headless: boolean;
  skyscannerHost: string;
  market: string;
  locale: string;
  currency: string;
  searchDeadlineMs: number;
  outputDir: string;
  /** `LOGGING=enabled|disabled`; default enabled. */
  loggingEnabled: boolean;
  /** `STOP_WHEN_STABLE=enabled|disabled`; default enabled: return once polls stop adding flights. */
  stopWhenStable: boolean;
}

type Env = Record<string, string | undefined>;

const positiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const findChrome = () => CHROME_CANDIDATES.find((path) => existsSync(path)) ?? "google-chrome";

/** Settings come only from `.env` in the working directory; shell and systemd variables are ignored. */
export function loadAppConfig(env: Env = readDotEnv()): AppConfig {
  return {
    port: positiveInt(env.PORT, 8000),
    hostname: "127.0.0.1",
    apiKey: env.API_KEY || undefined,
    poolSize: positiveInt(env.POOL_SIZE, 1),
    proxyUrl: env.PROXY_URL || undefined,
    chromePath: env.CHROME_PATH || findChrome(),
    headless: false,
    skyscannerHost: SKYSCANNER_SITE.host,
    market: SKYSCANNER_SITE.market,
    locale: SKYSCANNER_SITE.locale,
    currency: SKYSCANNER_SITE.currency,
    searchDeadlineMs: SEARCH_DEADLINE_MS,
    outputDir: OUTPUT_DIR,
    loggingEnabled: parseLoggingEnabled(env.LOGGING),
    stopWhenStable: parseLoggingEnabled(env.STOP_WHEN_STABLE),
  };
}
