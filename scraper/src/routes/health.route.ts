/** `GET /health`: pool status and counters; HTTP 503 while no browser is ready (same contract as the Zillow scraper). */
import type { RouteContext } from "./route-context";

export function createHealthRoute({ poolHealth }: RouteContext) {
  return {
    GET: (): Response => {
      const health = poolHealth();
      return Response.json(health, { status: health.live > 0 ? 200 : 503 });
    },
  };
}
