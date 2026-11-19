/** `GET /health`: browser pool state (ready/warming sessions, launches, retirements, per-session requests). */
export function createHealthRoute(poolHealth: () => unknown) {
  return {
    GET: (): Response => Response.json(poolHealth()),
  };
}
