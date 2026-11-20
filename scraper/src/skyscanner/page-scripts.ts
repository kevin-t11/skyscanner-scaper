/**
 * Functions that run INSIDE the Skyscanner page (via `Runtime.evaluate`), so
 * requests carry the browser's own cookies, TLS and PerimeterX state.
 * They are serialized with `toPageExpression`, so their bodies must not use
 * anything from outside the function (type-only imports are fine).
 */
import type { ApiAgent, ApiItinerary, UnifiedSearchRequestBody, UnifiedSearchResponse } from "./unified-search-api";

/** Builds a `Runtime.evaluate` expression that calls `pageFunction(args)` in the page. */
export const toPageExpression = <A>(pageFunction: (args: A) => unknown, args: A): string =>
  `(${pageFunction.toString()})(${JSON.stringify(args)})`;

// ---- Route lookup ----------------------------------------------------------

export interface RouteLookupResult {
  /** HTTP status of the search page; 0 when the request failed (see `failure`). */
  status: number;
  failure?: "timeout" | "network";
  finalUrl: string;
  originEntityId?: string;
  destinationEntityId?: string;
  destinationCityEntityId?: string;
}

/**
 * Fetches the server-rendered search page, whose `window.__internal` already
 * contains the route's entity ids, and extracts them.
 */
export async function lookupRouteEntitiesInPage(args: { pathAndQuery: string; timeoutMs: number }): Promise<RouteLookupResult> {
  let response: Response;
  let html: string;
  try {
    response = await fetch(args.pathAndQuery, { credentials: "include", signal: AbortSignal.timeout(args.timeoutMs) });
    html = await response.text();
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return { status: 0, finalUrl: args.pathAndQuery, failure: timedOut ? "timeout" : "network" };
  }
  const firstMatch = (pattern: RegExp) => html.match(pattern)?.[1];
  return {
    status: response.status,
    finalUrl: response.url,
    originEntityId: firstMatch(/"originEntityId":"(\d+)"/),
    destinationEntityId: firstMatch(/"destinationEntityId":"(\d+)"/),
    destinationCityEntityId: firstMatch(/"destination":\{[^}]*?"geoContainerId":"(\d+)"/),
  };
}

// ---- Unified search --------------------------------------------------------
// The server drives the create/poll loop (so it can log each step); every step
// is one in-page request whose results are merged into page-side state.

export interface UnifiedSearchStepArgs {
  /** `globalThis` key holding this search's merged results until `collectUnifiedSearchInPage`. */
  stateKey: string;
  url: string;
  method: "POST" | "GET";
  body?: string;
  headers: Record<string, string>;
  /** Aborts the request (and its body transfer) after this long. */
  timeoutMs: number;
}

export interface UnifiedSearchStep {
  /** HTTP status; 403 means PerimeterX rejected the session, 0 that the request failed. */
  httpStatus: number;
  /** Set when the step produced no usable response. */
  failure?: "network" | "malformed" | "timeout";
  status?: UnifiedSearchResponse["context"]["status"];
  sessionId?: string;
  /** Distinct itineraries merged so far, across all steps. */
  resultCount: number;
}

export interface UnifiedSearchPayload {
  results: ApiItinerary[];
  agents: ApiAgent[];
}

interface UnifiedSearchState {
  results: Map<string, ApiItinerary>;
  agents: Map<string, ApiAgent>;
}

/** One create (POST) or poll (GET) request. Polls sometimes return an empty list, so results are merged by id. */
export async function requestUnifiedSearchStepInPage(args: UnifiedSearchStepArgs): Promise<UnifiedSearchStep> {
  const store = globalThis as unknown as Record<string, UnifiedSearchState | undefined>;
  const state = (store[args.stateKey] ??= { results: new Map(), agents: new Map() });

  // Reading the body is part of the transfer: a drop there is a network failure, not bad JSON.
  let text: string;
  try {
    const response = await fetch(args.url, {
      method: args.method,
      body: args.body,
      headers: args.headers,
      credentials: "include",
      signal: AbortSignal.timeout(args.timeoutMs),
    });
    if (response.status !== 200) return { httpStatus: response.status, resultCount: state.results.size };
    text = await response.text();
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return { httpStatus: timedOut ? 200 : 0, failure: timedOut ? "timeout" : "network", resultCount: state.results.size };
  }

  let data: UnifiedSearchResponse;
  try {
    data = JSON.parse(text);
  } catch {
    return { httpStatus: 200, failure: "malformed", resultCount: state.results.size };
  }
  for (const itinerary of data.itineraries?.results ?? []) state.results.set(itinerary.id, itinerary);
  for (const agent of data.itineraries?.agents ?? []) state.agents.set(agent.id, agent);
  return {
    httpStatus: 200,
    status: data.context?.status,
    sessionId: data.context?.sessionId,
    resultCount: state.results.size,
  };
}

/** Returns the merged results as JSON (one string crosses CDP faster than a large object) and frees the state. */
export function collectUnifiedSearchInPage(args: { stateKey: string }): string {
  const store = globalThis as unknown as Record<string, UnifiedSearchState | undefined>;
  const state = store[args.stateKey];
  delete store[args.stateKey];
  const payload: UnifiedSearchPayload = {
    results: state ? [...state.results.values()] : [],
    agents: state ? [...state.agents.values()] : [],
  };
  return JSON.stringify(payload);
}
