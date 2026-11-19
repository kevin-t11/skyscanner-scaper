/** HTTP layer: request validation and error mapping only. */
import { SORT_ORDERS, type SortOrder } from "./parse";
import { NoSessionAvailable, SessionBlocked, UpstreamError, type FlightSearch, type SearchRequest } from "./service";
import { InvalidSearchUrl, parseSearchUrl } from "./url";

const MAX_LIMIT = 1_000;
const DEFAULT_LIMIT = 50;

class BadRequest extends Error {}

const json = (body: unknown, status = 200) => Response.json(body, { status });

function readRequest(input: Record<string, unknown>): SearchRequest {
  const url = input.url;
  if (typeof url !== "string" || !url) throw new BadRequest("`url` is required");
  parseSearchUrl(url); // fail fast, before a browser session is taken

  const max = input.max === undefined || input.max === "" ? DEFAULT_LIMIT : Number(input.max);
  if (!Number.isInteger(max) || max < 1 || max > MAX_LIMIT) throw new BadRequest(`\`max\` must be 1..${MAX_LIMIT}`);

  const sort = (input.sort ?? "best") as SortOrder;
  if (!SORT_ORDERS.includes(sort)) throw new BadRequest(`\`sort\` must be one of ${SORT_ORDERS.join(", ")}`);

  const fast = input.fast === true || input.fast === "true" || input.fast === "1";
  return { url, max, sort, fast };
}

async function handleSearch(search: FlightSearch, input: Record<string, unknown>): Promise<Response> {
  try {
    return json(await search.search(readRequest(input)));
  } catch (error) {
    const message = (error as Error).message;
    if (error instanceof BadRequest || error instanceof InvalidSearchUrl) return json({ error: message }, 400);
    if (error instanceof NoSessionAvailable) return json({ error: message }, 503);
    if (error instanceof SessionBlocked || error instanceof UpstreamError) return json({ error: message }, 502);
    console.error("[server] unexpected error", error);
    return json({ error: "internal error" }, 500);
  }
}

export function createServer(search: FlightSearch, health: () => unknown, port: number) {
  return Bun.serve({
    port,
    // Complete searches take up to SEARCH_DEADLINE_MS; Bun's default idle timeout is 10 s.
    idleTimeout: 60,
    routes: {
      "/health": () => json(health()),
      "/url": {
        GET: (req) => handleSearch(search, Object.fromEntries(new URL(req.url).searchParams)),
        POST: async (req) => {
          const body = await req.json().catch(() => null);
          if (!body || typeof body !== "object") return json({ error: "body must be a JSON object" }, 400);
          return handleSearch(search, body as Record<string, unknown>);
        },
      },
    },
    fetch: () => json({ error: "not found" }, 404),
  });
}
