/** Runtime configuration, read once from the environment. */
export interface Config {
  port: number;
  poolSize: number;
  proxyUrl: string | undefined;
  chromePath: string;
  headless: boolean;
  host: string;
  market: string;
  locale: string;
  currency: string;
  searchDeadlineMs: number;
}

const int = (value: string | undefined, fallback: number): number => {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    port: int(env.PORT, 8080),
    poolSize: int(env.POOL_SIZE, 2),
    proxyUrl: env.PROXY_URL || undefined,
    chromePath: env.CHROME_PATH || "google-chrome",
    headless: env.HEADLESS === "true",
    host: env.SKYSCANNER_HOST || "www.skyscanner.com",
    market: env.MARKET || "US",
    locale: env.LOCALE || "en-US",
    currency: env.CURRENCY || "USD",
    searchDeadlineMs: int(env.SEARCH_DEADLINE_MS, 12_000),
  };
}
