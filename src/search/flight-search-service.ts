/** The `/url` use case: search URL → route entities → in-page API search → ranked itineraries. */
import type { AppConfig } from "../config/app-config";
import { BrowserError, SessionBlockedError, SessionNetworkError, UpstreamError } from "../errors";
import { createLogger, formatDuration, type Logger } from "../logging/logger";
import type { BrowserSession } from "../sessions/browser-session";
import type { SessionPool } from "../sessions/session-pool";
import type { Itinerary, SortOrder } from "../skyscanner/itinerary";
import { rankItineraries, type ItineraryCounts } from "../skyscanner/itinerary-normalizer";
import { lookupRouteEntitiesInPage, toPageExpression, type RouteLookupResult } from "../skyscanner/page-scripts";
import { parseSearchUrl, type FlightSearchQuery, type ParsedSearchUrl } from "../skyscanner/search-url";
import {
  buildUnifiedSearchBody,
  buildUnifiedSearchHeaders,
  UNIFIED_SEARCH_ENDPOINT,
  type RouteEntities,
} from "../skyscanner/unified-search-api";
import { runUnifiedSearch, type UnifiedSearchOutcome } from "../skyscanner/unified-search-runner";

export interface FlightSearchRequest {
  searchUrl: string;
  maxItems: number;
  sort: SortOrder;
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
  /** False when the deadline was reached before Skyscanner finished. */
  complete: boolean;
  counts: ItineraryCounts;
  itineraries: Itinerary[];
  timings: SearchTimings;
}

export interface FlightSearch {
  /** `log` receives one line per step (session, route lookup, each poll); defaults to a `search` logger. */
  search(request: FlightSearchRequest, log?: Logger): Promise<FlightSearchResult>;
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

  async search(request: FlightSearchRequest, log: Logger = createLogger("search", { timed: true })): Promise<FlightSearchResult> {
    const startedAt = performance.now();
    const parsedUrl = parseSearchUrl(request.searchUrl);

    for (let attempt = 1; ; attempt++) {
      const session = await this.pool.acquire();
      log.info(`session ${session.id} acquired${attempt > 1 ? ` (retry ${attempt - 1})` : ""}`);
      try {
        return await session.run(() => this.searchOnSession(session, parsedUrl, request, startedAt, log));
      } catch (error) {
        // Blocks, network failures (e.g. a dead sticky proxy) and browser failures (crash, lost CDP
        // connection) are tied to this session: retire it and retry on a fresh one with a new IP.
        const retryable =
          error instanceof SessionBlockedError || error instanceof SessionNetworkError || error instanceof BrowserError;
        if (!retryable) throw error;
        log.warn(`session ${session.id} failed: ${(error as Error).message}`);
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
    log: Logger,
  ): Promise<FlightSearchResult> {
    const lookupStartedAt = performance.now();
    const route = await this.resolveRoute(session, parsedUrl, log);
    const routeLookupMs = Math.round(performance.now() - lookupStartedAt);

    const outcome = await this.runUnifiedSearch(session, parsedUrl.query, route, request, log);
    const { counts, itineraries } = rankItineraries(outcome.payloadJson, request.sort, request.maxItems, this.pool.origin);
    const stoppedBy = outcome.complete ? "complete" : outcome.timedOut ? "deadline reached" : "partial";
    log.info(
      `${stoppedBy} · ${counts.passed}/${counts.received} flights parsed in ${outcome.upstreamRequests} request${outcome.upstreamRequests === 1 ? "" : "s"} · search ${formatDuration(outcome.elapsedMs)}` +
        (outcome.firstResultsMs === null ? "" : `, first results ${formatDuration(outcome.firstResultsMs)}`),
    );
    return {
      query: parsedUrl.query,
      complete: outcome.complete,
      counts,
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

  private async resolveRoute(session: BrowserSession, { query, pathAndQuery }: ParsedSearchUrl, log: Logger): Promise<RouteEntities> {
    const cacheKey = `${query.from}|${query.to}`;
    const cached = this.routeCache.get(cacheKey);
    if (cached) {
      log.info(`route ${query.from}→${query.to} cached`);
      return cached;
    }
    const lookupStartedAt = performance.now();

    session.upstreamRequests++;
    const lookup = await session.browser.evaluate<RouteLookupResult>(
      toPageExpression(lookupRouteEntitiesInPage, { pathAndQuery, timeoutMs: ROUTE_LOOKUP_TIMEOUT_MS }),
    );
    if (lookup.failure === "timeout") throw new UpstreamError(`route lookup timed out after ${ROUTE_LOOKUP_TIMEOUT_MS} ms`);
    if (lookup.failure === "network") throw new SessionNetworkError("route lookup failed: network error");
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
    log.info(
      `url fetched · route ${query.from}=${route.originEntityId} → ${query.to}=${route.destinationEntityId} ` +
        `in ${formatDuration(performance.now() - lookupStartedAt)}`,
    );
    return route;
  }

  private async runUnifiedSearch(
    session: BrowserSession,
    query: FlightSearchQuery,
    route: RouteEntities,
    request: FlightSearchRequest,
    log: Logger,
  ): Promise<UnifiedSearchOutcome> {
    const { market, locale, currency, searchDeadlineMs } = this.config;
    const outcome = await runUnifiedSearch(
      session.browser,
      {
        endpoint: UNIFIED_SEARCH_ENDPOINT,
        headers: buildUnifiedSearchHeaders({ market, locale, currency }),
        body: buildUnifiedSearchBody(query, route),
        deadlineMs: searchDeadlineMs,
        pollIntervalMs: POLL_INTERVAL_MS,
      },
      ({ step, status, resultCount, newResults }) => {
        const label = step === 1 ? "search created" : `poll ${step}`;
        const delta = step === 1 ? "" : ` (+${newResults})`;
        log.info(`${label} · found ${resultCount} flights${delta} · ${status ?? "unknown"}`);
      },
    );
    if (outcome.httpStatus !== 200 || outcome.failure) {
      log.warn(`search API stopped: HTTP ${outcome.httpStatus}${outcome.failure ? ` (${outcome.failure})` : ""}`);
    }
    session.upstreamRequests += outcome.upstreamRequests;

    if (outcome.httpStatus === 403) {
      // Blocked before any results: retry elsewhere. Blocked mid-search: keep what we have, retire the session.
      if (outcome.resultCount === 0) throw new SessionBlockedError("search API returned 403");
      this.pool.retire(session, "search API returned 403 mid-search");
    } else if (outcome.failure === "malformed") {
      // Skyscanner's fault, not the session's: keep the session and any results already merged.
      if (outcome.resultCount === 0) throw new UpstreamError("search API returned invalid JSON");
    } else if (outcome.failure === "network") {
      if (outcome.resultCount === 0) throw new SessionNetworkError("search API unreachable: network error");
      this.pool.retire(session, "search API network error mid-search");
    } else if (outcome.httpStatus !== 200) {
      throw new UpstreamError(`search API returned HTTP ${outcome.httpStatus}`);
    } else if (outcome.timedOut && outcome.resultCount === 0) {
      throw new UpstreamError(`search returned no results within ${searchDeadlineMs} ms`);
    }
    return outcome;
  }
}
