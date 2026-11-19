/** Entry point: load config, start the browser pool and the HTTP server. */
import { loadAppConfig } from "./config/app-config";
import { createHttpServer } from "./server";
import { createLogger, setLoggingEnabled, setLogLevel } from "./logging/logger";
import { FlightSearchService } from "./search/flight-search-service";
import { SessionPool } from "./sessions/session-pool";

const config = loadAppConfig();
setLoggingEnabled(config.loggingEnabled);
setLogLevel(config.logLevel);
const log = createLogger("server");

const pool = new SessionPool(config);
const server = createHttpServer(new FlightSearchService(pool, config), () => pool.health(), {
  port: config.port,
  hostname: config.hostname,
  apiKey: config.apiKey,
  outputDir: config.outputDir,
});
log.info(
  `listening on http://${server.hostname}:${server.port} · ${config.skyscannerHost} (${config.market}/${config.currency}) · ` +
    `pool ${config.poolSize} · output ${config.outputDir ?? "off"}`,
);
void pool.start().then(() => log.info("first browser session ready, accepting searches"));

async function shutdown(signal: string): Promise<void> {
  log.info(`${signal} received, shutting down`);
  await server.stop();
  await pool.stop();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
