/** The response envelope every `/url` call returns, on success and on failure. */
import type { FlightSearchRequest, FlightSearchResult } from "../search/flight-search-service";
import type { FlightSearchQuery } from "../skyscanner/search-url";
import type { Itinerary } from "../skyscanner/itinerary";
import { describeRawInput, type RawSearchInput } from "./search-request";

export type FailureCode = "invalid_request" | "unauthorized" | "no_session" | "blocked" | "upstream_error" | "internal_error";

export interface SearchFailure {
  code: FailureCode;
  message: string;
}

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
  query: FlightSearchQuery | null;
  timings: FlightSearchResult["timings"] | null;
  results: Itinerary[];
  /** `{}` on pass. */
  failed: SearchFailure | Record<string, never>;
}

export function passEnvelope(request: FlightSearchRequest, result: FlightSearchResult, timeElapsedMs: number): SearchEnvelope {
  return {
    searchUrl: request.searchUrl,
    maxItems: request.maxItems,
    sorting: request.sort,
    fast: request.fast,
    status: "pass",
    timeElapsedMs,
    complete: result.complete,
    total: result.total,
    count: result.itineraries.length,
    query: result.query,
    timings: result.timings,
    results: result.itineraries,
    failed: {},
  };
}

/** Uses the validated request when there is one, so the echoed options are the ones the search used. */
export function failEnvelope(
  failure: SearchFailure,
  timeElapsedMs: number,
  source: { request: FlightSearchRequest } | { input: RawSearchInput },
): SearchEnvelope {
  const options =
    "request" in source
      ? { ...source.request, sort: source.request.sort as string }
      : describeRawInput(source.input);
  return {
    searchUrl: options.searchUrl,
    maxItems: options.maxItems,
    sorting: options.sort,
    fast: options.fast,
    status: "fail",
    timeElapsedMs,
    complete: false,
    total: 0,
    count: 0,
    query: null,
    timings: null,
    results: [],
    failed: failure,
  };
}
