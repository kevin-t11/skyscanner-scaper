/** The search use case (`/url`, `/search`): places → route entities → in-page API search → ranked itineraries; and `/places`. */
import type { AppConfig } from "../config/app-config";
import { BrowserError, PlaceNotFoundError, SessionBlockedError, SessionNetworkError, UpstreamError } from "../errors";
import { createLogger, formatDuration, type Logger } from "../utils/logger";
import type { BrowserSession } from "../sessions/browser-session";
import type { SessionPool } from "../sessions/session-pool";
import type { Itinerary, SortOrder } from "../types/itinerary";
import { rankItineraries, type ItineraryCounts } from "../parsers/itinerary-normalizer";
import { lookupRouteEntitiesInPage, toPageExpression, type RouteLookupResult } from "../skyscanner/page-scripts";
import { isChallengeUrl, solvePressAndHold } from "../skyscanner/px-challenge";
import { autosuggestInPage, normalizePlaces, pickPlace, type AutosuggestResult, type Place } from "../skyscanner/places";
import { buildSearchPath, buildSearchUrl, type FlightSearchQuery } from "../parsers/search-url";
import {
  buildUnifiedSearchBody,
  buildUnifiedSearchHeaders,
  UNIFIED_SEARCH_ENDPOINT,
  type RouteEntities,
} from "../skyscanner/unified-search-api";
import { runUnifiedSearch, type UnifiedSearchOutcome } from "../skyscanner/unified-search-runner";

export interface FlightSearchRequest {
  /** `from` / `to` are place codes (`/url`) or free text (`/search`). */
  query: FlightSearchQuery;
  maxItems: number;
  sort: SortOrder;
  /** `/url` only: places must match the URL's codes exactly; the search page is the fallback. */
  pathAndQuery?: string;
}

/** What `from` / `to` resolved to; `null` when only the search-page fallback knew the code. */
export interface RoutePlaces {
  from: Place | null;
  to: Place | null;
}

interface ResolvedRoute {
  route: RouteEntities;
  places: RoutePlaces;
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
  places: RoutePlaces;
  /** The same search on Skyscanner's website. */
  searchUrl: string;
  /** False when the deadline was reached before Skyscanner finished. */
  complete: boolean;
  counts: ItineraryCounts;
  itineraries: Itinerary[];
  timings: SearchTimings;
}

export interface FlightSearch {
  /** `log` receives one line per step (session, route lookup, each poll); defaults to a `search` logger. */
  search(request: FlightSearchRequest, log?: Logger): Promise<FlightSearchResult>;
  /** Autocomplete for the "From" (`isDestination` false) or "To" box. */
  suggestPlaces(text: string, isDestination: boolean): Promise<Place[]>;
}

const POLL_INTERVAL_MS = 600;
/** Skyscanner answers a poll in ~1-2 s; a request hanging past this is a dead proxy connection. */
const REQUEST_TIMEOUT_MS = 6_000;
/** With STOP_WHEN_STABLE, stop after the first poll that adds no itineraries. */
const STABLE_POLLS = 1;
const ROUTE_LOOKUP_TIMEOUT_MS = 10_000;
const PLACES_TIMEOUT_MS = 5_000;
/** A Skyscanner place code as a caller would type it: `BOM`, `NYCA`. */
const PLACE_CODE = /^[A-Z]{3,4}$/;
const ROUTE_CACHE_LIMIT = 10_000;
/** One retry on a fresh session after a block; more mostly burns proxy bandwidth. */
const MAX_ATTEMPTS = 2;

export class FlightSearchService implements FlightSearch {
  private readonly routeCache = new Map<string, ResolvedRoute>();
  private readonly placeCache = new Map<string, Place[]>();

  constructor(
    private readonly pool: SessionPool,
    private readonly config: AppConfig,
  ) {}

  async search(request: FlightSearchRequest, log: Logger = createLogger("search", { timed: true })): Promise<FlightSearchResult> {
    const startedAt = performance.now();
    let challengeTried = false;
    for (let attempt = 1; ; attempt++) {
      const session = await this.pool.acquire();
      log.info(`session ${session.id} acquired${attempt > 1 ? ` (retry ${attempt - 1})` : ""}`);
      try {
        const result = await session.run(() => this.searchOnSession(session, request, startedAt, log));
        this.pool.recordSuccess();
        return result;
      } catch (error) {
        // Blocks, network failures (e.g. a dead sticky proxy) and browser failures (crash, lost CDP
        // connection) are tied to this session: retire it and retry on a fresh one with a new IP.
        const retryable =
          error instanceof SessionBlockedError || error instanceof SessionNetworkError || error instanceof BrowserError;
        if (!retryable) throw error;
        // A "Press & Hold" page is solved once per request, only while no other search uses the page
        // (solving navigates it); on success the same session is kept.
        // Only worth it when no other warm session exists: solving takes ~15-30 s, a retry elsewhere a few.
        if (error instanceof SessionBlockedError && error.challengeUrl && !challengeTried && !this.pool.hasOtherReadySession(session)) {
          challengeTried = true;
          const challengeUrl = error.challengeUrl;
          const solved = await this.pool.runExclusive(session, (browser) => solvePressAndHold(browser, log, challengeUrl));
          if (solved) {
            attempt--;
            continue;
          }
        }
        log.warn(`session ${session.id} failed: ${(error as Error).message}`);
        this.pool.retire(session, (error as Error).message);
        if (attempt >= MAX_ATTEMPTS) {
          throw error;
        }
      }
    }
  }

  async suggestPlaces(text: string, isDestination: boolean): Promise<Place[]> {
    const session = await this.pool.acquire();
    try {
      return await session.run(() => this.placesOnSession(session, text, isDestination));
    } catch (error) {
      if (error instanceof SessionBlockedError || error instanceof SessionNetworkError || error instanceof BrowserError) {
        this.pool.retire(session, (error as Error).message);
      }
      throw error;
    }
  }

  private async searchOnSession(
    session: BrowserSession,
    request: FlightSearchRequest,
    startedAt: number,
    log: Logger,
  ): Promise<FlightSearchResult> {
    const lookupStartedAt = performance.now();
    const { route, places } = await this.resolveRoute(session, request, log);
    const routeLookupMs = Math.round(performance.now() - lookupStartedAt);

    const outcome = await this.runUnifiedSearch(session, request.query, route, request, log);
    const { counts, itineraries } = rankItineraries(outcome.payloadJson, request.sort, request.maxItems, this.pool.origin);
    const stoppedBy = outcome.complete ? "complete" : outcome.timedOut ? "deadline reached" : outcome.stable ? "stable" : "partial";
    log.info(
      `${stoppedBy} · ${counts.passed}/${counts.received} flights parsed in ${outcome.upstreamRequests} request${outcome.upstreamRequests === 1 ? "" : "s"} · search ${formatDuration(outcome.elapsedMs)}` +
        (outcome.firstResultsMs === null ? "" : `, first results ${formatDuration(outcome.firstResultsMs)}`),
    );
    return {
      query: request.query,
      places,
      searchUrl: buildSearchUrl(this.pool.origin, request.query, places),
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

  /** Place codes and names map to the same entities forever, so routes are cached by input text. */
  private async resolveRoute(session: BrowserSession, request: FlightSearchRequest, log: Logger): Promise<ResolvedRoute> {
    const { query, pathAndQuery } = request;
    const cacheKey = `${query.from}|${query.to}`.toLowerCase();
    const cached = this.routeCache.get(cacheKey);
    if (cached) {
      log.info(`route ${query.from}→${query.to} cached`);
      return cached;
    }
    const lookupStartedAt = performance.now();

    // A URL holds exact place codes; free text (`/search`) takes the top suggestion.
    const exactOnly = pathAndQuery !== undefined;
    const [from, to] = await Promise.all([
      this.placesOnSession(session, query.from, false).then((places) => pickPlace(places, query.from, exactOnly)),
      this.placesOnSession(session, query.to, true).then((places) => pickPlace(places, query.to, exactOnly)),
    ]);

    let resolved: ResolvedRoute;
    if (from && to) {
      resolved = {
        route: {
          originEntityId: from.entityId,
          destinationEntityId: to.entityId,
          destinationCityEntityId: to.type === "city" ? to.entityId : undefined,
        },
        places: { from, to },
      };
    } else if (pathAndQuery || [from ? null : query.from, to ? null : query.to].every((text) => text === null || PLACE_CODE.test(text))) {
      // Codes autocomplete does not return (e.g. `NYCA`, `DXBA`): the search page knows them.
      const path = pathAndQuery ?? buildSearchPath(query, { from: from ?? null, to: to ?? null });
      resolved = { route: await this.lookupRouteFromPage(session, path, query), places: { from: from ?? null, to: to ?? null } };
    } else {
      throw new PlaceNotFoundError(`no airport or city matches "${from ? query.to : query.from}"`);
    }

    if (this.routeCache.size >= ROUTE_CACHE_LIMIT) this.routeCache.clear();
    this.routeCache.set(cacheKey, resolved);
    const label = (text: string, place: Place | null) => (place ? `${text}=${place.name} (${place.code}, ${place.type})` : text);
    log.info(
      `places resolved · ${label(query.from, resolved.places.from)} → ${label(query.to, resolved.places.to)} ` +
        `in ${formatDuration(performance.now() - lookupStartedAt)}`,
    );
    return resolved;
  }

  /** Autocomplete suggestions for `text`; blocks and network failures are the session's, like a search. */
  private async placesOnSession(session: BrowserSession, text: string, isDestination: boolean): Promise<Place[]> {
    const cacheKey = `${isDestination ? "to" : "from"}|${text.trim().toLowerCase()}`;
    const cached = this.placeCache.get(cacheKey);
    if (cached) return cached;
    session.upstreamRequests++;
    const { market, locale } = this.config;
    const result = await session.browser.evaluate<AutosuggestResult>(
      toPageExpression(autosuggestInPage, { market, locale, text: text.trim(), isDestination, timeoutMs: PLACES_TIMEOUT_MS }),
    );
    if (result.failure === "network") throw new SessionNetworkError("place autocomplete failed: network error");
    if (result.failure === "timeout") throw new SessionNetworkError(`place autocomplete timed out after ${PLACES_TIMEOUT_MS} ms`);
    // Autocomplete answers some inputs (e.g. `NYCA`) with 403 even on healthy sessions: treat it as
    // "no suggestions" (not cached), so codes fall back to the search page, which detects real blocks.
    if (result.status === 403) return [];
    if (result.status !== 200 || result.failure) {
      throw new UpstreamError(`place autocomplete returned HTTP ${result.status}${result.failure ? ` (${result.failure})` : ""}`);
    }
    const places = normalizePlaces(result.places);
    if (this.placeCache.size >= ROUTE_CACHE_LIMIT) this.placeCache.clear();
    this.placeCache.set(cacheKey, places);
    return places;
  }

  /** Fallback for URL codes autocomplete does not know exactly: the search page's own entity ids. */
  private async lookupRouteFromPage(session: BrowserSession, pathAndQuery: string, query: FlightSearchQuery): Promise<RouteEntities> {
    session.upstreamRequests++;
    const lookup = await session.browser.evaluate<RouteLookupResult>(
      toPageExpression(lookupRouteEntitiesInPage, { pathAndQuery, timeoutMs: ROUTE_LOOKUP_TIMEOUT_MS }),
    );
    if (lookup.failure === "timeout") throw new UpstreamError(`route lookup timed out after ${ROUTE_LOOKUP_TIMEOUT_MS} ms`);
    if (lookup.failure === "network") throw new SessionNetworkError("route lookup failed: network error");
    if (isChallengeUrl(lookup.finalUrl)) throw new SessionBlockedError("search page challenged", lookup.finalUrl);
    if (lookup.status === 403) throw new SessionBlockedError("search page returned 403");
    if (!lookup.originEntityId || !lookup.destinationEntityId) {
      throw new PlaceNotFoundError(`could not resolve places "${query.from}" / "${query.to}" (HTTP ${lookup.status})`);
    }
    return {
      originEntityId: lookup.originEntityId,
      destinationEntityId: lookup.destinationEntityId,
      destinationCityEntityId: lookup.destinationCityEntityId,
    };
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
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
        stablePolls: this.config.stopWhenStable ? STABLE_POLLS : 0,
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
