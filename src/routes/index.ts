/**
 * Every HTTP endpoint, in one place. To add one (e.g. `/details`), create
 * `routes/<name>.route.ts` and register it here.
 *
 *   GET|POST /url     search a Skyscanner flight URL → sorted itineraries
 *   GET      /health  browser pool state
 */
import type { FlightSearch } from "../search/flight-search-service";
import { createHealthRoute } from "./health.route";
import { createUrlRoute, type UrlRouteOptions } from "./url.route";

export function createRoutes(search: FlightSearch, poolHealth: () => unknown, options: UrlRouteOptions = {}) {
  return {
    "/url": createUrlRoute(search, options),
    "/health": createHealthRoute(poolHealth),
  };
}
