/**
 * Every HTTP endpoint, in one place. To add one (e.g. `/details`), create
 * `routes/<name>.route.ts` (or a `routes/<name>/` folder) and register it here.
 *
 *   GET|POST /url     search a Skyscanner flight URL → sorted itineraries
 *   GET      /health  browser pool state
 */
import { createHealthRoute } from "./health.route";
import type { RouteContext } from "./route-context";
import { createUrlRoute } from "./url/url.route";

export type { RouteContext } from "./route-context";

export function createRoutes(context: RouteContext) {
  return {
    "/url": createUrlRoute(context),
    "/health": createHealthRoute(context),
  };
}
