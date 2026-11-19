/** HTTP layer: authentication, input validation, and mapping results/errors to the envelope. */
import {
  InvalidSearchUrlError,
  NoSessionAvailableError,
  SessionBlockedError,
  UpstreamError,
} from "../errors";
import type { FlightSearch, FlightSearchRequest } from "../search/flight-search-service";
import { failEnvelope, passEnvelope, type FailureCode, type SearchEnvelope } from "./search-envelope";
import { InvalidRequestError, parseSearchRequest, type RawSearchInput } from "./search-request";

export interface HttpServerOptions {
  port: number;
  hostname?: string;
  /** When set, `/url` requires `x-api-key: <apiKey>`. */
  apiKey?: string;
}

const HTTP_STATUS: Record<FailureCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  no_session: 503,
  blocked: 502,
  upstream_error: 502,
  internal_error: 500,
};

function failureCodeFor(error: unknown): FailureCode {
  if (error instanceof InvalidRequestError || error instanceof InvalidSearchUrlError) return "invalid_request";
  if (error instanceof NoSessionAvailableError) return "no_session";
  if (error instanceof SessionBlockedError) return "blocked";
  if (error instanceof UpstreamError) return "upstream_error";
  return "internal_error";
}

const envelopeResponse = (envelope: SearchEnvelope, code?: FailureCode) =>
  Response.json(envelope, { status: code ? HTTP_STATUS[code] : 200 });

async function handleSearch(search: FlightSearch, input: RawSearchInput): Promise<Response> {
  const startedAt = performance.now();
  const elapsed = () => Math.round(performance.now() - startedAt);
  let request: FlightSearchRequest | undefined;
  try {
    request = parseSearchRequest(input);
    return envelopeResponse(passEnvelope(request, await search.search(request), elapsed()));
  } catch (error) {
    const code = failureCodeFor(error);
    if (code === "internal_error") console.error("[http] unexpected error", error);
    const message = code === "internal_error" ? "internal error" : (error as Error).message;
    return envelopeResponse(failEnvelope({ code, message }, elapsed(), request ? { request } : { input }), code);
  }
}

const rejectInput = (input: RawSearchInput, code: FailureCode, message: string) =>
  envelopeResponse(failEnvelope({ code, message }, 0, { input }), code);

export function createHttpServer(search: FlightSearch, poolHealth: () => unknown, options: HttpServerOptions) {
  const isAuthorized = (req: Request) => !options.apiKey || req.headers.get("x-api-key") === options.apiKey;

  return Bun.serve({
    port: options.port,
    hostname: options.hostname,
    // Complete searches take up to SEARCH_DEADLINE_MS; Bun's default idle timeout is 10 s.
    idleTimeout: 60,
    routes: {
      "/health": () => Response.json(poolHealth()),
      "/url": {
        GET: (req) => {
          const input = Object.fromEntries(new URL(req.url).searchParams);
          if (!isAuthorized(req)) return rejectInput(input, "unauthorized", "missing or invalid x-api-key");
          return handleSearch(search, input);
        },
        POST: async (req) => {
          // Check the key before reading the body, so unauthenticated callers cannot make us parse it.
          if (!isAuthorized(req)) return rejectInput({}, "unauthorized", "missing or invalid x-api-key");
          const body: unknown = await req.json().catch(() => null);
          if (!body || typeof body !== "object" || Array.isArray(body)) {
            return rejectInput({}, "invalid_request", "body must be a JSON object");
          }
          return handleSearch(search, body as RawSearchInput);
        },
      },
    },
    fetch: () => Response.json({ error: "not found" }, { status: 404 }),
  });
}
