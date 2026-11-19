/** The response envelope every `/url` call returns, on success and on failure. */
import type { FlightSearchRequest, FlightSearchResult, SearchTimings } from "../../search/flight-search-service";
import type { Itinerary } from "../../skyscanner/itinerary";
import type { FlightSearchQuery } from "../../skyscanner/search-url";
import { describeRawInput, type RawSearchInput } from "./url-request";

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
