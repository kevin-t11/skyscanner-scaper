/** HTTP layer: request validation and error mapping only. */
import { SORT_ORDERS, type SortOrder } from "./parse";
import {
  NoSessionAvailable,
  SessionBlocked,
  UpstreamError,
  type FlightSearch,
  type SearchRequest,
  type SearchResponse,
} from "./service";
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

/** Every `/url` response, success or failure, uses this envelope. */
export interface SearchEnvelope {
  searchUrl: string | null;
  maxItems: number | null;
  sorting: string | null;
  fast: boolean;
  status: "pass" | "fail";
  timeElapsedMs: number;
  complete: boolean;
  total: number;
  count: number;
  query: SearchResponse["query"] | null;
  timings: SearchResponse["timings"] | null;
  results: SearchResponse["itineraries"];
  /** `{}` on pass; `{ code, message }` on fail. */
  failed: { code: string; message: string } | Record<string, never>;
}

type FailCode = "invalid_request" | "unauthorized" | "no_session" | "blocked" | "upstream_error" | "internal_error";
const FAIL_STATUS: Record<FailCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  no_session: 503,
  blocked: 502,
  upstream_error: 502,
  internal_error: 500,
};

function failCode(error: unknown): FailCode {
  if (error instanceof BadRequest || error instanceof InvalidSearchUrl) return "invalid_request";
  if (error instanceof NoSessionAvailable) return "no_session";
  if (error instanceof SessionBlocked) return "blocked";
  if (error instanceof UpstreamError) return "upstream_error";
  return "internal_error";
}

function failure(input: Record<string, unknown>, started: number, code: FailCode, message: string): Response {
  const num = Number(input.max);
  const envelope: SearchEnvelope = {
    searchUrl: typeof input.url === "string" ? input.url : null,
    maxItems: Number.isFinite(num) ? num : null,
    sorting: typeof input.sort === "string" ? input.sort : null,
    fast: input.fast === true || input.fast === "true" || input.fast === "1",
    status: "fail",
    timeElapsedMs: Math.round(performance.now() - started),
    complete: false,
    total: 0,
    count: 0,
    query: null,
    timings: null,
    results: [],
    failed: { code, message },
  };
  return json(envelope, FAIL_STATUS[code]);
}

async function handleSearch(search: FlightSearch, input: Record<string, unknown>): Promise<Response> {
  const started = performance.now();
  try {
    const request = readRequest(input);
    const result = await search.search(request);
    const envelope: SearchEnvelope = {
      searchUrl: request.url,
      maxItems: request.max,
      sorting: request.sort,
      fast: request.fast,
      status: "pass",
      timeElapsedMs: Math.round(performance.now() - started),
      complete: result.complete,
      total: result.total,
      count: result.count,
      query: result.query,
      timings: result.timings,
      results: result.itineraries,
      failed: {},
    };
    return json(envelope);
  } catch (error) {
    const code = failCode(error);
    if (code === "internal_error") console.error("[server] unexpected error", error);
    return failure(input, started, code, code === "internal_error" ? "internal error" : (error as Error).message);
  }
}

export interface ServerOptions {
  port: number;
  hostname?: string;
  apiKey?: string;
}

export function createServer(search: FlightSearch, health: () => unknown, { port, hostname, apiKey }: ServerOptions) {
  const authorized = (req: Request) => !apiKey || req.headers.get("x-api-key") === apiKey;
  const unauthorized = (input: Record<string, unknown>) =>
    failure(input, performance.now(), "unauthorized", "missing or invalid x-api-key");
  return Bun.serve({
    port,
    hostname,
    // Complete searches take up to SEARCH_DEADLINE_MS; Bun's default idle timeout is 10 s.
    idleTimeout: 60,
    routes: {
      "/health": () => json(health()),
      "/url": {
        GET: (req) => {
          const input = Object.fromEntries(new URL(req.url).searchParams);
          return authorized(req) ? handleSearch(search, input) : unauthorized(input);
        },
        POST: async (req) => {
          const body = await req.json().catch(() => null);
          const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
          if (!authorized(req)) return unauthorized(input);
          if (input !== body) return failure(input, performance.now(), "invalid_request", "body must be a JSON object");
          return handleSearch(search, input);
        },
      },
    },
    fetch: () => json({ error: "not found" }, 404),
  });
}
