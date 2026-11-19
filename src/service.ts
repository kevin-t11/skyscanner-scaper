/** `/url` use case: search URL → entity ids → in-page API search → sorted itineraries. */
import { CdpError } from "./cdp";
import type { Config } from "./config";
import { parseResults, type Itinerary, type SortOrder } from "./parse";
import { NoSessionAvailable, type Session, type SessionPool } from "./pool";
import {
  buildHeaders,
  buildSearchBody,
  pageCall,
  pageResolve,
  pageSearch,
  SEARCH_ENDPOINT,
  type Entities,
} from "./skyscanner";
import { parseSearchUrl, type SearchQuery } from "./url";

export interface SearchRequest {
  url: string;
  max: number;
  sort: SortOrder;
  fast: boolean;
}

export interface SearchResponse {
  query: Omit<SearchQuery, "path">;
  sort: SortOrder;
  complete: boolean;
  total: number;
  count: number;
  timings: { resolveMs: number; searchMs: number; firstResultsMs: number | null; totalMs: number; requests: number };
  itineraries: Itinerary[];
}

export interface FlightSearch {
  search(request: SearchRequest): Promise<SearchResponse>;
}

/** PerimeterX rejected the session (HTTP 403 or a captcha redirect). */
export class SessionBlocked extends Error {}
export class UpstreamError extends Error {}

const POLL_INTERVAL_MS = 600;
const ENTITY_CACHE_LIMIT = 10_000;
/** One retry on a fresh session after a block; more mostly burns proxy bandwidth. */
const MAX_ATTEMPTS = 2;

export class SearchService implements FlightSearch {
  private readonly entityCache = new Map<string, Entities>();

  constructor(
    private readonly pool: SessionPool,
    private readonly config: Config,
  ) {}

  async search(request: SearchRequest): Promise<SearchResponse> {
    const started = performance.now();
    const query = parseSearchUrl(request.url);

    for (let attempt = 1; ; attempt++) {
      const session = await this.pool.acquire();
      try {
        return await session.use(async () => {
          const resolveStarted = performance.now();
          const entities = await this.resolve(session, query);
          const resolveMs = Math.round(performance.now() - resolveStarted);
          const result = await this.runSearch(session, query, entities, request);
          const { total, itineraries } = parseResults(result.payload, request.sort, request.max, this.pool.origin);
          const { path: _path, ...publicQuery } = query;
          return {
            query: publicQuery,
            sort: request.sort,
            complete: result.complete,
            total,
            count: itineraries.length,
            timings: {
              resolveMs,
              searchMs: result.elapsedMs,
              firstResultsMs: result.firstResultsMs,
              totalMs: Math.round(performance.now() - started),
              requests: result.requests,
            },
            itineraries,
          };
        });
      } catch (error) {
        // A block, or the browser going away under us (crash, or retired by a parallel search), is retryable.
        const retryable = error instanceof SessionBlocked || (error instanceof CdpError && !session.usable);
        if (!retryable) throw error;
        this.pool.retire(session, (error as Error).message);
        if (attempt >= MAX_ATTEMPTS) throw error instanceof SessionBlocked ? error : new SessionBlocked(error.message);
      }
    }
  }

  /** Entity ids for the route, cached because they never change for a place code. */
  private async resolve(session: Session, query: SearchQuery): Promise<Entities> {
    const key = `${query.from}|${query.to}`;
    const cached = this.entityCache.get(key);
    if (cached) return cached;

    session.requests++;
    const page = await session.browser.evaluate<Awaited<ReturnType<typeof pageResolve>>>(pageCall(pageResolve, query.path));
    if (page.status === 403 || page.url.includes("/captcha")) throw new SessionBlocked("search page challenged");
    if (!page.origin || !page.destination) {
      throw new UpstreamError(`could not resolve places "${query.from}" / "${query.to}" (HTTP ${page.status})`);
    }
    const entities: Entities = { origin: page.origin, destination: page.destination, placeOfStay: page.placeOfStay };
    if (this.entityCache.size >= ENTITY_CACHE_LIMIT) this.entityCache.clear();
    this.entityCache.set(key, entities);
    return entities;
  }

  private async runSearch(session: Session, query: SearchQuery, entities: Entities, request: SearchRequest) {
    const { market, locale, currency, searchDeadlineMs } = this.config;
    const result = await session.browser.evaluate<Awaited<ReturnType<typeof pageSearch>>>(
      pageCall(pageSearch, {
        endpoint: SEARCH_ENDPOINT,
        headers: buildHeaders({ market, locale, currency }),
        body: buildSearchBody(query, entities),
        want: request.max,
        fast: request.fast,
        deadlineMs: searchDeadlineMs,
        pollIntervalMs: POLL_INTERVAL_MS,
      }),
    );
    session.requests += result.requests;
    // A block after results arrived still returns what we have; a block before that needs a new session.
    if (result.httpStatus === 403) {
      if (result.resultCount === 0) throw new SessionBlocked("search API returned 403");
      this.pool.retire(session, "search API returned 403 mid-search");
    } else if (result.httpStatus !== 200) {
      throw new UpstreamError(`search API returned HTTP ${result.httpStatus}`);
    } else if (result.timedOut && result.resultCount === 0) {
      throw new UpstreamError(`search returned no results within ${searchDeadlineMs} ms`);
    }
    return result;
  }
}

export { NoSessionAvailable };
