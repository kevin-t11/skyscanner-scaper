/**
 * `POST /url` (JSON body), in one file:
 *   1. request:  `parseSearchRequest` validates url / max / sort / fast and applies defaults
 *   2. response: `SearchEnvelope` with `passEnvelope` / `failEnvelope`
 *   3. handler:  `createUrlRoute` checks the API key, runs the search, logs each step, saves the JSON
 */
import {
  InvalidSearchUrlError,
  NoSessionAvailableError,
  SessionBlockedError,
  UpstreamError,
} from "../errors";
import { createLogger, formatDuration, type Logger } from "../logging/logger";
import { saveSearchOutput } from "../output/search-output-writer";
import type { FlightSearchRequest, FlightSearchResult, SearchTimings } from "../search/flight-search-service";
import { SORT_ORDERS, type Itinerary, type SortOrder } from "../skyscanner/itinerary";
import { parseSearchUrl, type FlightSearchQuery } from "../skyscanner/search-url";
import type { RouteContext } from "./route-context";

// ── request ──

export const DEFAULT_MAX_ITEMS = 50;
export const MAX_ITEMS_LIMIT = 1_000;
export const DEFAULT_SORT: SortOrder = "best";

export class InvalidRequestError extends Error {}

export type RawSearchInput = Record<string, unknown>;

const isBlank = (value: unknown) => value === undefined || value === null || value === "";
const isTrue = (value: unknown) => value === true || value === "true" || value === "1";

export function parseSearchRequest(input: RawSearchInput): FlightSearchRequest {
  const searchUrl = input.url;
  if (typeof searchUrl !== "string" || !searchUrl) throw new InvalidRequestError("`url` is required");
  parseSearchUrl(searchUrl); // fail fast, before a browser session is taken

  const maxItems = isBlank(input.max) ? DEFAULT_MAX_ITEMS : typeof input.max === "number" || typeof input.max === "string" ? Number(input.max) : NaN;
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > MAX_ITEMS_LIMIT) {
    throw new InvalidRequestError(`\`max\` must be an integer 1..${MAX_ITEMS_LIMIT}`);
  }

  const sort = isBlank(input.sort) ? DEFAULT_SORT : input.sort;
  if (!SORT_ORDERS.includes(sort as SortOrder)) {
    throw new InvalidRequestError(`\`sort\` must be one of ${SORT_ORDERS.join(", ")}`);
  }

  return { searchUrl, maxItems, sort: sort as SortOrder, fast: isTrue(input.fast) };
}

/**
 * Best-effort echo of the caller's options for a failure envelope when the
 * input itself was invalid. Never throws; applies the same defaults.
 */
export function describeRawInput(input: RawSearchInput): Pick<FlightSearchRequest, "fast"> & {
  searchUrl: string | null;
  maxItems: number | null;
  sort: string | null;
} {
  const max = isBlank(input.max) ? DEFAULT_MAX_ITEMS : typeof input.max === "number" ? input.max : typeof input.max === "string" ? Number(input.max) : NaN;
  return {
    searchUrl: typeof input.url === "string" ? input.url : null,
    maxItems: Number.isFinite(max) ? max : null,
    sort: isBlank(input.sort) ? DEFAULT_SORT : typeof input.sort === "string" ? input.sort : null,
    fast: isTrue(input.fast),
  };
}

// ── response ──

export type FailureCode = "invalid_request" | "unauthorized" | "no_session" | "blocked" | "upstream_error" | "internal_error";

export interface SearchFailure {
  code: FailureCode;
  message: string;
}

/** The options the search ran with (defaults applied); `null` fields were missing or invalid. */
export interface SearchRequestSummary {
  searchUrl: string | null;
  maxItems: number | null;
  sorting: string | null;
  fast: boolean;
}

export interface SearchResultSummary {
  /** False when stopped by `fast` or the deadline before Skyscanner finished. */
  complete: boolean;
  /** Priced itineraries Skyscanner returned. */
  total: number;
  /** Itineraries in this response (`<= maxItems`). */
  count: number;
  query: FlightSearchQuery;
  timings: SearchTimings;
  itineraries: Itinerary[];
}

export interface SearchEnvelope {
  status: "pass" | "fail";
  timeElapsedMs: number;
  request: SearchRequestSummary;
  /** `null` on fail. */
  result: SearchResultSummary | null;
  /** `{}` on pass. */
  failed: SearchFailure | Record<string, never>;
}

const summarizeRequest = (request: FlightSearchRequest): SearchRequestSummary => ({
  searchUrl: request.searchUrl,
  maxItems: request.maxItems,
  sorting: request.sort,
  fast: request.fast,
});

export function passEnvelope(request: FlightSearchRequest, result: FlightSearchResult, timeElapsedMs: number): SearchEnvelope {
  return {
    status: "pass",
    timeElapsedMs,
    request: summarizeRequest(request),
    result: {
      complete: result.complete,
      total: result.total,
      count: result.itineraries.length,
      query: result.query,
      timings: result.timings,
      itineraries: result.itineraries,
    },
    failed: {},
  };
}

/** Uses the validated request when there is one, so the echoed options are the ones the search used. */
export function failEnvelope(
  failure: SearchFailure,
  timeElapsedMs: number,
  source: { request: FlightSearchRequest } | { input: RawSearchInput },
): SearchEnvelope {
  let request: SearchRequestSummary;
  if ("request" in source) {
    request = summarizeRequest(source.request);
  } else {
    const raw = describeRawInput(source.input);
    request = { searchUrl: raw.searchUrl, maxItems: raw.maxItems, sorting: raw.sort, fast: raw.fast };
  }
  return { status: "fail", timeElapsedMs, request, result: null, failed: failure };
}

// ── handler ──

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

const newRequestId = () => crypto.randomUUID().slice(0, 6);

const envelopeResponse = (envelope: SearchEnvelope, requestId: string, code?: FailureCode) =>
  Response.json(envelope, { status: code ? HTTP_STATUS[code] : 200, headers: { "x-request-id": requestId } });

/** Formats an unvalidated input value for a log line; never throws, whatever the caller sent. */
const formatInputValue = (value: unknown, fallback: string): string => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return `<${Array.isArray(value) ? "array" : typeof value}>`;
};

const describeInput = (input: RawSearchInput) =>
  `sort=${formatInputValue(input.sort, "best")} max=${formatInputValue(input.max, "50")}` +
  `${input.fast ? ` fast=${formatInputValue(input.fast, "")}` : ""} url=${formatInputValue(input.url, "-")}`;

function logOutcome(log: Logger, envelope: SearchEnvelope): void {
  if (envelope.status === "pass" && envelope.result) {
    const { count, total, complete, itineraries } = envelope.result;
    const top = itineraries[0];
    const topLabel = top ? ` · top ${top.priceFormatted || top.price}, ${top.durationMinutes} min` : "";
    log.info(`pass · ${count}/${total} flights${complete ? "" : " (partial)"}${topLabel} · ${formatDuration(envelope.timeElapsedMs)}`);
  } else {
    const failure = envelope.failed as { code?: string; message?: string };
    log.warn(`fail · ${failure.code}: ${failure.message} · ${formatDuration(envelope.timeElapsedMs)}`);
  }
}

export function createUrlRoute({ search, apiKey, outputDir }: RouteContext) {
  const isAuthorized = (req: Request) => !apiKey || req.headers.get("x-api-key") === apiKey;

  async function finish(envelope: SearchEnvelope, requestId: string, log: Logger, code?: FailureCode): Promise<Response> {
    logOutcome(log, envelope);
    if (outputDir) {
      try {
        log.info(`saved ${await saveSearchOutput(outputDir, envelope, requestId)}`);
      } catch (error) {
        log.warn(`could not save output: ${(error as Error).message}`);
      }
    }
    return envelopeResponse(envelope, requestId, code);
  }

  async function handleSearch(input: RawSearchInput): Promise<Response> {
    const requestId = newRequestId();
    const log = createLogger(`req ${requestId}`, { timed: true });
    log.info(`POST /url ${describeInput(input)}`);
    let request: FlightSearchRequest | undefined;
    try {
      request = parseSearchRequest(input);
      const result = await search.search(request, log);
      return await finish(passEnvelope(request, result, log.elapsedMs()), requestId, log);
    } catch (error) {
      const code = failureCodeFor(error);
      if (code === "internal_error") log.error(`unexpected error: ${(error as Error).stack ?? error}`);
      const message = code === "internal_error" ? "internal error" : (error as Error).message;
      const envelope = failEnvelope({ code, message }, log.elapsedMs(), request ? { request } : { input });
      return await finish(envelope, requestId, log, code);
    }
  }

  /** Rejected before a search starts: logged, not saved. */
  function rejectInput(input: RawSearchInput, code: FailureCode, message: string): Response {
    const requestId = newRequestId();
    createLogger(`req ${requestId}`).warn(`rejected · ${code}: ${message}`);
    return envelopeResponse(failEnvelope({ code, message }, 0, { input }), requestId, code);
  }

  return {
    GET: (): Response =>
      Response.json({ error: "use POST /url with a JSON body" }, { status: 405, headers: { allow: "POST" } }),
    async POST(req: Request): Promise<Response> {
      // Check the key before reading the body, so unauthenticated callers cannot make us parse it.
      if (!isAuthorized(req)) return rejectInput({}, "unauthorized", "missing or invalid x-api-key");
      const body: unknown = await req.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return rejectInput({}, "invalid_request", "body must be a JSON object");
      }
      return handleSearch(body as RawSearchInput);
    },
  };
}
