/** HTTP bootstrap only: starts Bun's server with the routes from `routes/`. */
import type { FlightSearch } from "./search/flight-search-service";
import { createRoutes } from "./routes";
import type { UrlRouteOptions } from "./routes/url.route";

export interface HttpServerOptions extends UrlRouteOptions {
  port: number;
  hostname?: string;
}

export function createHttpServer(search: FlightSearch, poolHealth: () => unknown, options: HttpServerOptions) {
  const { port, hostname, ...routeOptions } = options;
  return Bun.serve({
    port,
    hostname,
    // Complete searches take up to SEARCH_DEADLINE_MS; Bun's default idle timeout is 10 s.
    idleTimeout: 60,
    routes: createRoutes(search, poolHealth, routeOptions),
    fetch: () => Response.json({ error: "not found" }, { status: 404 }),
  });
}
