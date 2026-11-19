/** The `/url` use case: search URL → route entities → in-page API search → ranked itineraries. */
import type { AppConfig } from "../config/app-config";
import { BrowserError, SessionBlockedError, UpstreamError } from "../errors";
import type { BrowserSession } from "../sessions/browser-session";
import type { SessionPool } from "../sessions/session-pool";
import type { Itinerary, SortOrder } from "../skyscanner/itinerary";
import { rankItineraries } from "../skyscanner/itinerary-normalizer";
import {
  lookupRouteEntitiesInPage,
  runUnifiedSearchInPage,
  toPageExpression,
  type RouteLookupResult,
  type UnifiedSearchOutcome,
} from "../skyscanner/page-scripts";
import { parseSearchUrl, type FlightSearchQuery, type ParsedSearchUrl } from "../skyscanner/search-url";
import {
  buildUnifiedSearchBody,
  buildUnifiedSearchHeaders,
  UNIFIED_SEARCH_ENDPOINT,
  type RouteEntities,
} from "../skyscanner/unified-search-api";

export interface FlightSearchRequest {
  searchUrl: string;
  maxItems: number;
  sort: SortOrder;
  /** Return as soon as `maxItems` itineraries are known instead of waiting for `complete`. */
  fast: boolean;
}

export interface SearchTimings {
  routeLookupMs: number;
  searchMs: number;
  firstResultsMs: number | null;
  totalMs: number;
  upstreamRequests: number;
}

export interface FlightSearchResult {
  query: FlightSearchQuery;
  /** False when stopped by `fast` or the deadline before Skyscanner finished. */
  complete: boolean;
  total: number;
  itineraries: Itinerary[];
  timings: SearchTimings;
}

export interface FlightSearch {
  search(request: FlightSearchRequest): Promise<FlightSearchResult>;
}

const POLL_INTERVAL_MS = 600;
const ROUTE_LOOKUP_TIMEOUT_MS = 10_000;
const ROUTE_CACHE_LIMIT = 10_000;
/** One retry on a fresh session after a block; more mostly burns proxy bandwidth. */
const MAX_ATTEMPTS = 2;

export class FlightSearchService implements FlightSearch {
  /** `from|to` → entity ids; place codes map to the same entities forever. */
  private readonly routeCache = new Map<string, RouteEntities>();

  constructor(
    private readonly pool: SessionPool,
    private readonly config: AppConfig,
  ) {}

  async search(request: FlightSearchRequest): Promise<FlightSearchResult> {
    const startedAt = performance.now();
    const parsedUrl = parseSearchUrl(request.searchUrl);

    for (let attempt = 1; ; attempt++) {
      const session = await this.pool.acquire();
      try {
        return await session.run(() => this.searchOnSession(session, parsedUrl, request, startedAt));
      } catch (error) {
        // A block or a browser failure (crash, lost CDP connection, retirement) is retried on a fresh session.
        // A page script error (e.g. a dropped API connection) is an upstream error and keeps the session.
        const retryable = error instanceof SessionBlockedError || error instanceof BrowserError;
        if (!retryable) throw error;
        this.pool.retire(session, (error as Error).message);
        if (attempt >= MAX_ATTEMPTS) {
          throw error;
        }
      }
    }
  }

  private async searchOnSession(
    session: BrowserSession,
    parsedUrl: ParsedSearchUrl,
    request: FlightSearchRequest,
    startedAt: number,
  ): Promise<FlightSearchResult> {
    const lookupStartedAt = performance.now();
    const route = await this.resolveRoute(session, parsedUrl);
    const routeLookupMs = Math.round(performance.now() - lookupStartedAt);

    const outcome = await this.runUnifiedSearch(session, parsedUrl.query, route, request);
    const { total, itineraries } = rankItineraries(outcome.payloadJson, request.sort, request.maxItems, this.pool.origin);
    return {
      query: parsedUrl.query,
      complete: outcome.complete,
      total,
      itineraries,
      timings: {
        routeLookupMs,
        searchMs: outcome.elapsedMs,
        firstResultsMs: outcome.firstResultsMs,
        totalMs: Math.round(performance.now() - startedAt),
        upstreamRequests: outcome.upstreamRequests,
      },
    };
  }

  private async resolveRoute(session: BrowserSession, { query, pathAndQuery }: ParsedSearchUrl): Promise<RouteEntities> {
    const cacheKey = `${query.from}|${query.to}`;
    const cached = this.routeCache.get(cacheKey);
    if (cached) return cached;

    session.upstreamRequests++;
    const lookup = await session.browser.evaluate<RouteLookupResult>(
      toPageExpression(lookupRouteEntitiesInPage, { pathAndQuery, timeoutMs: ROUTE_LOOKUP_TIMEOUT_MS }),
    );
    if (lookup.failure === "timeout") throw new UpstreamError(`route lookup timed out after ${ROUTE_LOOKUP_TIMEOUT_MS} ms`);
    if (lookup.failure === "network") throw new UpstreamError("route lookup failed: network error");
    if (lookup.status === 403 || lookup.finalUrl.includes("/captcha")) throw new SessionBlockedError("search page challenged");
    if (!lookup.originEntityId || !lookup.destinationEntityId) {
      throw new UpstreamError(`could not resolve places "${query.from}" / "${query.to}" (HTTP ${lookup.status})`);
    }

    const route: RouteEntities = {
      originEntityId: lookup.originEntityId,
      destinationEntityId: lookup.destinationEntityId,
      destinationCityEntityId: lookup.destinationCityEntityId,
    };
    if (this.routeCache.size >= ROUTE_CACHE_LIMIT) this.routeCache.clear();
    this.routeCache.set(cacheKey, route);
    return route;
  }

  private async runUnifiedSearch(
    session: BrowserSession,
    query: FlightSearchQuery,
    route: RouteEntities,
    request: FlightSearchRequest,
  ): Promise<UnifiedSearchOutcome> {
    const { market, locale, currency, searchDeadlineMs } = this.config;
    const outcome = await session.browser.evaluate<UnifiedSearchOutcome>(
      toPageExpression(runUnifiedSearchInPage, {
        endpoint: UNIFIED_SEARCH_ENDPOINT,
        headers: buildUnifiedSearchHeaders({ market, locale, currency }),
        body: buildUnifiedSearchBody(query, route),
        enoughResults: request.maxItems,
        stopWhenEnough: request.fast,
        deadlineMs: searchDeadlineMs,
        pollIntervalMs: POLL_INTERVAL_MS,
      }),
    );
    session.upstreamRequests += outcome.upstreamRequests;

    if (outcome.httpStatus === 403) {
      // Blocked before any results: retry elsewhere. Blocked mid-search: keep what we have, retire the session.
      if (outcome.resultCount === 0) throw new SessionBlockedError("search API returned 403");
      this.pool.retire(session, "search API returned 403 mid-search");
    } else if (outcome.httpStatus !== 200) {
      throw new UpstreamError(`search API returned HTTP ${outcome.httpStatus}`);
    } else if (outcome.timedOut && outcome.resultCount === 0) {
      throw new UpstreamError(`search returned no results within ${searchDeadlineMs} ms`);
    }
    return outcome;
  }
}
