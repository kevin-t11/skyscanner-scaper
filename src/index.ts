import { loadConfig } from "./config";
import { SessionPool } from "./pool";
import { createServer } from "./server";
import { SearchService } from "./service";

const config = loadConfig();
const pool = new SessionPool(config);
const server = createServer(new SearchService(pool, config), () => pool.health(), config);
console.info(`[server] listening on http://${server.hostname}:${server.port} (warming ${config.poolSize} browser sessions)`);
void pool.start().then(() => console.info("[server] first session ready"));

const shutdown = async () => {
  await server.stop();
  await pool.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
