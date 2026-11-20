/**
 * `POST /url` (JSON body) and the flight-search handling it shares with `POST /search`:
 *   1. request:  `parseSearchRequest` validates url / max / sort and applies defaults
 *   2. response: `SearchEnvelope` with `passEnvelope` / `failEnvelope`
 *   3. handler:  `createFlightSearchRoute` checks the API key, runs the search, logs each step, saves the JSON
 */
import {
  InvalidSearchUrlError,
  NoSessionAvailableError,
  PlaceNotFoundError,
  SessionBlockedError,
  UpstreamError,
} from "../errors";
import { createLogger, formatDuration, type Logger } from "../utils/logger";
import { saveSearchOutput } from "../utils/output-writer";
import type { FlightSearchRequest, FlightSearchResult, RoutePlaces, SearchTimings } from "../services/flight-search.service";
import { SORT_ORDERS, type Itinerary, type SortOrder } from "../types/itinerary";
import { parseSearchUrl, type FlightSearchQuery } from "../parsers/search-url";
import type { RouteContext } from "./route-context";

// ── request ──

const DEFAULT_MAX_ITEMS = 50;
const MAX_ITEMS_LIMIT = 1_000;
const DEFAULT_SORT: SortOrder = "best";

export class InvalidRequestError extends Error {}

export type RawSearchInput = Record<string, unknown>;

/** A validated request and the options it echoes back in the envelope. */
export interface ParsedSearchRequest {
  request: FlightSearchRequest;
  summary: SearchRequestSummary;
}

const isBlank = (value: unknown) => value === undefined || value === null || value === "";

/** Validates `max` / `sort` (shared by `/url` and `/search`) and applies defaults. */
export function parseListOptions(input: RawSearchInput): Pick<FlightSearchRequest, "maxItems" | "sort"> {
  const maxItems = isBlank(input.max) ? DEFAULT_MAX_ITEMS : typeof input.max === "number" || typeof input.max === "string" ? Number(input.max) : NaN;
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > MAX_ITEMS_LIMIT) {
    throw new InvalidRequestError(`\`max\` must be an integer 1..${MAX_ITEMS_LIMIT}`);
  }
  const sort = isBlank(input.sort) ? DEFAULT_SORT : input.sort;
  if (!SORT_ORDERS.includes(sort as SortOrder)) {
    throw new InvalidRequestError(`\`sort\` must be one of ${SORT_ORDERS.join(", ")}`);
  }
  return { maxItems, sort: sort as SortOrder };
}

/** Best-effort echo of `max` / `sort` for a failure envelope when the input was invalid; never throws. */
export function describeListOptions(input: RawSearchInput): Pick<SearchRequestSummary, "maxItems" | "sorting"> {
  const max = isBlank(input.max) ? DEFAULT_MAX_ITEMS : typeof input.max === "number" ? input.max : typeof input.max === "string" ? Number(input.max) : NaN;
  return {
    maxItems: Number.isFinite(max) ? max : null,
    sorting: isBlank(input.sort) ? DEFAULT_SORT : typeof input.sort === "string" ? input.sort : null,
  };
}

/** Unvalidated text input for a summary: strings as-is, anything else `null`. */
export const textOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);

function parseSearchRequest(input: RawSearchInput): ParsedSearchRequest {
  const searchUrl = input.url;
  if (typeof searchUrl !== "string" || !searchUrl) throw new InvalidRequestError("`url` is required");
  const { query, pathAndQuery } = parseSearchUrl(searchUrl); // fail fast, before a browser session is taken
  const options = parseListOptions(input);
  return { request: { query, pathAndQuery, ...options }, summary: { searchUrl, maxItems: options.maxItems, sorting: options.sort } };
}

const describeUrlInput = (input: RawSearchInput): SearchRequestSummary => ({ searchUrl: textOrNull(input.url), ...describeListOptions(input) });

// ── response ──

export type FailureCode = "invalid_request" | "unauthorized" | "no_session" | "blocked" | "upstream_error" | "internal_error";

export interface SearchFailure {
  code: FailureCode;
  message: string;
}

/** The options the search ran with (defaults applied); `null` fields were missing or invalid. */
export interface SearchRequestSummary {
  maxItems: number | null;
  sorting: string | null;
  /** Route-specific fields: `searchUrl` for `/url`; `from`, `to`, dates, cabin, adults for `/search`. */
  [field: string]: string | number | null;
}

export interface SearchResultSummary {
  /** False when the deadline was reached before Skyscanner finished. */
  complete: boolean;
  /** total = usable flights found, failed = broken ones dropped, returned = in this response (`<= maxItems`). */
  counts: { total: number; failed: number; returned: number };
  query: FlightSearchQuery;
  /** What `from` / `to` resolved to. */
  places: RoutePlaces;
  /** The same search on Skyscanner's website. */
  searchUrl: string;
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

function passEnvelope(request: SearchRequestSummary, result: FlightSearchResult, timeElapsedMs: number): SearchEnvelope {
  return {
    status: "pass",
    timeElapsedMs,
    request,
    result: {
      complete: result.complete,
      counts: { total: result.counts.passed, failed: result.counts.failed, returned: result.itineraries.length },
      query: result.query,
      places: result.places,
      searchUrl: result.searchUrl,
      timings: result.timings,
      itineraries: result.itineraries,
    },
    failed: {},
  };
}

const failEnvelope = (failure: SearchFailure, timeElapsedMs: number, request: SearchRequestSummary): SearchEnvelope => ({
  status: "fail",
  timeElapsedMs,
  request,
  result: null,
  failed: failure,
});

// ── handler ──

export const HTTP_STATUS: Record<FailureCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  no_session: 503,
  blocked: 502,
  upstream_error: 502,
  internal_error: 500,
};

export function failureCodeFor(error: unknown): FailureCode {
  if (error instanceof InvalidRequestError || error instanceof InvalidSearchUrlError || error instanceof PlaceNotFoundError) return "invalid_request";
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

const describeInput = (input: RawSearchInput, fields: string[]) =>
  fields.map((field) => `${field}=${formatInputValue(input[field], field === "sort" ? DEFAULT_SORT : field === "max" ? String(DEFAULT_MAX_ITEMS) : "-")}`).join(" ");

/** What differs between `/url` and `/search`: how the body becomes a request. */
export interface FlightSearchRouteSpec {
  path: string;
  /** Body fields shown in the request's first log line. */
  logFields: string[];
  parse: (input: RawSearchInput) => ParsedSearchRequest;
  /** Echo for a failure envelope when `parse` threw; never throws. */
  describe: (input: RawSearchInput) => SearchRequestSummary;
}

function logOutcome(log: Logger, envelope: SearchEnvelope): void {
  if (envelope.status === "pass" && envelope.result) {
    const { counts, complete, itineraries } = envelope.result;
    const top = itineraries[0];
    const topLabel = top ? ` · top ${top.priceFormatted || top.price}, ${top.durationMinutes} min` : "";
    log.info(`pass · ${counts.returned}/${counts.total} flights (${counts.failed} failed)${complete ? "" : " (partial)"}${topLabel} · ${formatDuration(envelope.timeElapsedMs)}`);
  } else {
    const failure = envelope.failed as { code?: string; message?: string };
    log.warn(`fail · ${failure.code}: ${failure.message} · ${formatDuration(envelope.timeElapsedMs)}`);
  }
}

export function createFlightSearchRoute({ search, apiKey, outputDir }: RouteContext, spec: FlightSearchRouteSpec) {
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
    log.info(`POST ${spec.path} ${describeInput(input, spec.logFields)}`);
    let parsed: ParsedSearchRequest | undefined;
    try {
      parsed = spec.parse(input);
      const result = await search.search(parsed.request, log);
      return await finish(passEnvelope(parsed.summary, result, log.elapsedMs()), requestId, log);
    } catch (error) {
      const code = failureCodeFor(error);
      if (code === "internal_error") log.error(`unexpected error: ${(error as Error).stack ?? error}`);
      const message = code === "internal_error" ? "internal error" : (error as Error).message;
      const envelope = failEnvelope({ code, message }, log.elapsedMs(), parsed?.summary ?? spec.describe(input));
      return await finish(envelope, requestId, log, code);
    }
  }

  /** Rejected before a search starts: logged, not saved. */
  function rejectInput(input: RawSearchInput, code: FailureCode, message: string): Response {
    const requestId = newRequestId();
    createLogger(`req ${requestId}`).warn(`rejected · ${code}: ${message}`);
    return envelopeResponse(failEnvelope({ code, message }, 0, spec.describe(input)), requestId, code);
  }

  return {
    GET: (): Response =>
      Response.json({ error: `use POST ${spec.path} with a JSON body` }, { status: 405, headers: { allow: "POST" } }),
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

export const createUrlRoute = (context: RouteContext) =>
  createFlightSearchRoute(context, { path: "/url", logFields: ["sort", "max", "url"], parse: parseSearchRequest, describe: describeUrlInput });
