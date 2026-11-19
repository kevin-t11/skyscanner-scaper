/**
 * `GET /places?q=mumb&type=from|to`: Skyscanner's "From" / "To" autocomplete.
 *   → { "query": "mumb", "type": "from", "places": [{ "name": "Mumbai", "code": "IBOM", "iata": "BOM", "type": "city", … }] }
 * Use a place's `name` or `code` as `from` / `to` in `POST /search`.
 */
import { createLogger, formatDuration } from "../utils/logger";
import type { RouteContext } from "./route-context";
import { failureCodeFor, HTTP_STATUS } from "./url.route";

const MAX_QUERY_LENGTH = 100;

export function createPlacesRoute({ search, apiKey }: RouteContext) {
  return {
    async GET(req: Request): Promise<Response> {
      if (apiKey && req.headers.get("x-api-key") !== apiKey) {
        return Response.json({ error: "missing or invalid x-api-key" }, { status: 401 });
      }
      const params = new URL(req.url).searchParams;
      const text = (params.get("q") ?? "").trim();
      const type = params.get("type") ?? "from";
      if (!text || text.length > MAX_QUERY_LENGTH) {
        return Response.json({ error: `\`q\` is required (1..${MAX_QUERY_LENGTH} characters)` }, { status: 400 });
      }
      if (type !== "from" && type !== "to") return Response.json({ error: "`type` must be from or to" }, { status: 400 });

      const log = createLogger("places", { timed: true });
      try {
        const places = await search.suggestPlaces(text, type === "to");
        log.info(`GET /places q=${JSON.stringify(text)} type=${type} · ${places.length} places · ${formatDuration(log.elapsedMs())}`);
        return Response.json({ query: text, type, places });
      } catch (error) {
        const code = failureCodeFor(error);
        const message = code === "internal_error" ? "internal error" : (error as Error).message;
        log.warn(`GET /places q=${JSON.stringify(text)} failed · ${code}: ${(error as Error).message}`);
        return Response.json({ error: message, code }, { status: HTTP_STATUS[code] });
      }
    },
  };
}
