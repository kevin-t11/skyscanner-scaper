/** `GET /health`: browser pool state (ready/warming sessions, launches, retirements, per-session requests). */
import type { RouteContext } from "./route-context";

export function createHealthRoute({ poolHealth }: RouteContext) {
  return {
    GET: (): Response => Response.json(poolHealth()),
  };
}
