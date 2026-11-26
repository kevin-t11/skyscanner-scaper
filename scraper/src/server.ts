/** HTTP bootstrap only: starts Bun's server with the routes from `routes/`. */
import { createRoutes, type RouteContext } from "./routes";

export interface HttpServerOptions extends Omit<RouteContext, "search" | "poolHealth"> {
  port: number;
  hostname?: string;
}

export function createHttpServer(search: RouteContext["search"], poolHealth: RouteContext["poolHealth"], options: HttpServerOptions) {
  const { port, hostname, ...routeOptions } = options;
  return Bun.serve({
    port,
    hostname,
    // A search takes up to the 30 s deadline, twice with a retry; Bun's default idle timeout is 10 s.
    idleTimeout: 90,
    routes: createRoutes({ search, poolHealth, ...routeOptions }),
    fetch: () => Response.json({ error: "not found" }, { status: 404 }),
  });
}
