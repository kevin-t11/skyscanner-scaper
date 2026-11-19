/**
 * Skyscanner's internal flight-search contract, as used by its own web app
 * (`/g/radar/api/v2/web-unified-search/`). The functions marked "runs in the
 * page" are serialized and evaluated inside the browser tab, so they must not
 * reference anything outside their own body.
 */
import type { SearchQuery } from "./url";

export const SEARCH_ENDPOINT = "/g/radar/api/v2/web-unified-search/";

export interface Culture {
  market: string;
  locale: string;
  currency: string;
}

export interface Entities {
  origin: string;
  destination: string;
  /** City entity of the destination; the web app sends it as the first leg's `placeOfStay`. */
  placeOfStay?: string;
}

const entity = (entityId: string) => ({ "@type": "entity", entityId });

const date = (iso: string) => {
  const [year, month, day] = iso.split("-");
  return { "@type": "date", year, month, day };
};

/** Request body for `POST web-unified-search`, one leg per date (return leg reverses the route). */
export function buildSearchBody(query: SearchQuery, entities: Entities) {
  const legs = query.dates.map((iso, index) => {
    const outbound = index === 0;
    return {
      legOrigin: entity(outbound ? entities.origin : entities.destination),
      legDestination: entity(outbound ? entities.destination : entities.origin),
      dates: date(iso),
      ...(outbound && entities.placeOfStay ? { placeOfStay: entities.placeOfStay } : {}),
    };
  });
  return { cabinClass: query.cabin, childAges: query.childAges, adults: query.adults, legs };
}

export function buildHeaders(culture: Culture): Record<string, string> {
  const viewId = crypto.randomUUID();
  return {
    accept: "application/json",
    "content-type": "application/json",
    "x-skyscanner-channelid": "website",
    "x-skyscanner-market": culture.market,
    "x-skyscanner-locale": culture.locale,
    "x-skyscanner-currency": culture.currency,
    "x-skyscanner-viewid": viewId,
    "x-skyscanner-trustedfunnelid": viewId,
    "x-skyscanner-consent-adverts": "false",
    "x-skyscanner-skip-accommodation-carhire": "true",
  };
}

/** Builds a `Runtime.evaluate` expression that calls a page function with JSON arguments. */
export const pageCall = <A>(fn: (args: A) => unknown, args: A): string =>
  `(${fn.toString()})(${JSON.stringify(args)})`;

export interface PageResolveResult {
  status: number;
  url: string;
  origin?: string;
  destination?: string;
  placeOfStay?: string;
}

/**
 * Runs in the page. Fetches the server-rendered search page, whose
 * `window.__internal` already contains the resolved entity ids.
 */
export async function pageResolve(path: string): Promise<PageResolveResult> {
  const response = await fetch(path, { credentials: "include", signal: AbortSignal.timeout(10_000) });
  const html = await response.text();
  const pick = (pattern: RegExp) => html.match(pattern)?.[1];
  return {
    status: response.status,
    url: response.url,
    origin: pick(/"originEntityId":"(\d+)"/),
    destination: pick(/"destinationEntityId":"(\d+)"/),
    placeOfStay: pick(/"destination":\{[^}]*?"geoContainerId":"(\d+)"/),
  };
}

export interface PageSearchArgs {
  endpoint: string;
  headers: Record<string, string>;
  body: unknown;
  /** Stop early once this many itineraries are known (only with `fast`). */
  want: number;
  fast: boolean;
  deadlineMs: number;
  pollIntervalMs: number;
}

export interface PageSearchResult {
  /** Last HTTP status; 403 means PerimeterX rejected this browser session. */
  httpStatus: number;
  complete: boolean;
  requests: number;
  elapsedMs: number;
  firstResultsMs: number | null;
  /** True when `deadlineMs` cut an in-flight request short. */
  timedOut: boolean;
  resultCount: number;
  /** JSON text of `{ results, agents }`: one string crosses CDP faster than a large object. */
  payload: string;
}

/**
 * Runs in the page. Creates the search and polls until Skyscanner reports
 * `complete`, the deadline passes, or (fast mode) enough results arrived.
 * Polls sometimes return an empty list, so results are merged by id.
 */
export async function pageSearch(args: PageSearchArgs): Promise<PageSearchResult> {
  const started = performance.now();
  const results = new Map<string, unknown>();
  const agents = new Map<string, unknown>();
  let context: { status?: string; sessionId?: string } = {};
  let requests = 0;
  let firstResultsMs: number | null = null;
  let timedOut = false;
  // Hard deadline: aborts a stalled request instead of only gating the next poll.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.deadlineMs);

  const call = async (url: string, init: RequestInit): Promise<number> => {
    requests++;
    let data;
    try {
      const response = await fetch(url, { ...init, credentials: "include", headers: args.headers, signal: controller.signal });
      if (response.status !== 200) return response.status;
      data = await response.json();
    } catch (error) {
      if (!controller.signal.aborted) throw error;
      timedOut = true;
      return 200;
    }
    context = data.context ?? {};
    for (const item of data.itineraries?.results ?? []) results.set(item.id, item);
    for (const agent of data.itineraries?.agents ?? []) agents.set(agent.id, agent);
    if (firstResultsMs === null && results.size > 0) firstResultsMs = Math.round(performance.now() - started);
    return 200;
  };

  let httpStatus = await call(args.endpoint, { method: "POST", body: JSON.stringify(args.body) });
  while (httpStatus === 200 && !timedOut && context.status !== "complete" && context.sessionId) {
    if (args.fast && results.size >= args.want) break;
    if (performance.now() - started + args.pollIntervalMs > args.deadlineMs) {
      timedOut = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, args.pollIntervalMs));
    httpStatus = await call(args.endpoint + encodeURIComponent(context.sessionId), { method: "GET" });
  }

  clearTimeout(timer);
  return {
    httpStatus,
    complete: !timedOut && context.status === "complete",
    requests,
    elapsedMs: Math.round(performance.now() - started),
    firstResultsMs,
    timedOut,
    resultCount: results.size,
    payload: JSON.stringify({ results: [...results.values()], agents: [...agents.values()] }),
  };
}
