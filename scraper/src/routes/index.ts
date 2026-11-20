/**
 * Every HTTP endpoint, in one place. To add one (e.g. `/details`), create
 * `routes/<name>.route.ts` and register it here.
 *
 *   POST /search   search by fields (from, to, dates, cabin, adults) → sorted itineraries
 *   POST /url      search a Skyscanner flight URL → sorted itineraries
 *   GET  /places   "From" / "To" autocomplete
 *   GET  /health   browser pool state
 */
import { createHealthRoute } from "./health.route";
import { createPlacesRoute } from "./places.route";
import type { RouteContext } from "./route-context";
import { createSearchRoute } from "./search.route";
import { createUrlRoute } from "./url.route";

export type { RouteContext } from "./route-context";

export function createRoutes(context: RouteContext) {
  return {
    "/search": createSearchRoute(context),
    "/url": createUrlRoute(context),
    "/places": createPlacesRoute(context),
    "/health": createHealthRoute(context),
  };
}
