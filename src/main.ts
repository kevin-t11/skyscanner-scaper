/** Entry point: load config, start the browser pool and the HTTP server. */
import { loadAppConfig } from "./config/app-config";
import { createHttpServer } from "./http/http-server";
import { FlightSearchService } from "./search/flight-search-service";
import { SessionPool } from "./sessions/session-pool";

const config = loadAppConfig();
const pool = new SessionPool(config);
const server = createHttpServer(new FlightSearchService(pool, config), () => pool.health(), config);
console.info(`[http] listening on http://${server.hostname}:${server.port} (warming ${config.poolSize} browser sessions)`);
void pool.start().then(() => console.info("[http] first browser session ready"));

async function shutdown(): Promise<void> {
  await server.stop();
  await pool.stop();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
