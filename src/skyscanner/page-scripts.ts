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
  /** HTTP status of the search page; 0 when the lookup timed out. */
  status: number;
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
  } catch {
    return { status: 0, finalUrl: args.pathAndQuery };
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

export interface UnifiedSearchArgs {
  endpoint: string;
  headers: Record<string, string>;
  body: UnifiedSearchRequestBody;
  /** With `stopWhenEnough`, stop once this many itineraries are known. */
  enoughResults: number;
  stopWhenEnough: boolean;
  deadlineMs: number;
  pollIntervalMs: number;
}

export interface UnifiedSearchOutcome {
  /** Last HTTP status; 403 means PerimeterX rejected this browser session. */
  httpStatus: number;
  complete: boolean;
  /** True when the deadline ended the search before Skyscanner reported `complete`. */
  timedOut: boolean;
  upstreamRequests: number;
  elapsedMs: number;
  firstResultsMs: number | null;
  resultCount: number;
  /** JSON of `UnifiedSearchPayload`: one string crosses CDP faster than a large object. */
  payloadJson: string;
}

export interface UnifiedSearchPayload {
  results: ApiItinerary[];
  agents: ApiAgent[];
}

/**
 * Creates the search and polls until Skyscanner reports `complete`, the
 * deadline passes (in-flight requests are aborted), or enough results arrived.
 * Polls sometimes return an empty list, so results are merged by id.
 */
export async function runUnifiedSearchInPage(args: UnifiedSearchArgs): Promise<UnifiedSearchOutcome> {
  const startedAt = performance.now();
  const resultsById = new Map<string, ApiItinerary>();
  const agentsById = new Map<string, ApiAgent>();
  let context: Partial<UnifiedSearchResponse["context"]> = {};
  let upstreamRequests = 0;
  let firstResultsMs: number | null = null;
  let timedOut = false;
  const deadline = new AbortController();
  const deadlineTimer = setTimeout(() => deadline.abort(), args.deadlineMs);

  const request = async (url: string, init: RequestInit): Promise<number> => {
    upstreamRequests++;
    let data: UnifiedSearchResponse;
    try {
      const response = await fetch(url, { ...init, credentials: "include", headers: args.headers, signal: deadline.signal });
      if (response.status !== 200) return response.status;
      data = await response.json();
    } catch (error) {
      if (!deadline.signal.aborted) throw error;
      timedOut = true;
      return 200;
    }
    context = data.context ?? {};
    for (const itinerary of data.itineraries?.results ?? []) resultsById.set(itinerary.id, itinerary);
    for (const agent of data.itineraries?.agents ?? []) agentsById.set(agent.id, agent);
    if (firstResultsMs === null && resultsById.size > 0) firstResultsMs = Math.round(performance.now() - startedAt);
    return 200;
  };

  let httpStatus = await request(args.endpoint, { method: "POST", body: JSON.stringify(args.body) });
  while (httpStatus === 200 && !timedOut && context.status !== "complete" && context.sessionId) {
    if (args.stopWhenEnough && resultsById.size >= args.enoughResults) break;
    if (performance.now() - startedAt + args.pollIntervalMs > args.deadlineMs) {
      timedOut = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, args.pollIntervalMs));
    httpStatus = await request(args.endpoint + encodeURIComponent(context.sessionId), { method: "GET" });
  }
  clearTimeout(deadlineTimer);

  const payload: UnifiedSearchPayload = { results: [...resultsById.values()], agents: [...agentsById.values()] };
  return {
    httpStatus,
    complete: !timedOut && context.status === "complete",
    timedOut,
    upstreamRequests,
    elapsedMs: Math.round(performance.now() - startedAt),
    firstResultsMs,
    resultCount: resultsById.size,
    payloadJson: JSON.stringify(payload),
  };
}
