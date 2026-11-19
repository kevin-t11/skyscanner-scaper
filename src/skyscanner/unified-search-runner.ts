/**
 * Runs one `web-unified-search` (create, then poll until `complete`) through a
 * page, one in-page request per step, reporting progress after each step.
 */
import {
  collectUnifiedSearchInPage,
  requestUnifiedSearchStepInPage,
  toPageExpression,
  type UnifiedSearchStep,
} from "./page-scripts";
import type { UnifiedSearchRequestBody } from "./unified-search-api";

/** Anything that can run an expression in a Skyscanner page (`ChromeBrowser` in production). */
export interface PageEvaluator {
  evaluate<T>(expression: string): Promise<T>;
}

export interface UnifiedSearchOptions {
  endpoint: string;
  headers: Record<string, string>;
  body: UnifiedSearchRequestBody;
  /** With `stopWhenEnough`, stop once this many itineraries are known. */
  enoughResults: number;
  stopWhenEnough: boolean;
  deadlineMs: number;
  pollIntervalMs: number;
}

export interface UnifiedSearchProgress {
  /** 1 for the create request, then 2, 3, … for polls. */
  step: number;
  status: UnifiedSearchStep["status"];
  resultCount: number;
  newResults: number;
  elapsedMs: number;
}

export interface UnifiedSearchOutcome {
  /** Last HTTP status; 403 means PerimeterX rejected the session, 0 a network failure. */
  httpStatus: number;
  /** Why polling stopped early: the request failed, or a 200 response was not valid JSON. */
  failure?: "network" | "malformed";
  complete: boolean;
  /** True when the deadline ended the search before Skyscanner reported `complete`. */
  timedOut: boolean;
  upstreamRequests: number;
  elapsedMs: number;
  firstResultsMs: number | null;
  resultCount: number;
  /** JSON of `UnifiedSearchPayload`. */
  payloadJson: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runUnifiedSearch(
  page: PageEvaluator,
  options: UnifiedSearchOptions,
  onProgress?: (progress: UnifiedSearchProgress) => void,
): Promise<UnifiedSearchOutcome> {
  const startedAt = performance.now();
  const elapsedMs = () => Math.round(performance.now() - startedAt);
  const stateKey = `__search_${crypto.randomUUID().replaceAll("-", "")}`;
  const collect = () => page.evaluate<string>(toPageExpression(collectUnifiedSearchInPage, { stateKey }));

  let upstreamRequests = 0;
  let httpStatus = 0;
  let failure: UnifiedSearchOutcome["failure"];
  let timedOut = false;
  let status: UnifiedSearchStep["status"];
  let sessionId: string | undefined;
  let resultCount = 0;
  let firstResultsMs: number | null = null;

  const step = async (url: string, method: "POST" | "GET", body?: string) => {
    upstreamRequests++;
    const result = await page.evaluate<UnifiedSearchStep>(
      toPageExpression(requestUnifiedSearchStepInPage, {
        stateKey,
        url,
        method,
        body,
        headers: options.headers,
        timeoutMs: Math.max(1, options.deadlineMs - elapsedMs()),
      }),
    );
    httpStatus = result.httpStatus;
    if (result.failure === "timeout") timedOut = true;
    else failure = result.failure;
    status = result.status ?? status;
    sessionId = result.sessionId ?? sessionId;
    const newResults = result.resultCount - resultCount;
    resultCount = result.resultCount;
    if (firstResultsMs === null && resultCount > 0) firstResultsMs = elapsedMs();
    if (httpStatus === 200 && !result.failure) {
      onProgress?.({ step: upstreamRequests, status, resultCount, newResults, elapsedMs: elapsedMs() });
    }
  };

  try {
    await step(options.endpoint, "POST", JSON.stringify(options.body));
    while (httpStatus === 200 && !failure && !timedOut && status !== "complete" && sessionId) {
      if (options.stopWhenEnough && resultCount >= options.enoughResults) break;
      if (elapsedMs() + options.pollIntervalMs > options.deadlineMs) {
        timedOut = true;
        break;
      }
      await sleep(options.pollIntervalMs);
      await step(options.endpoint + encodeURIComponent(sessionId), "GET");
    }
  } catch (error) {
    await collect().catch(() => undefined);
    throw error;
  }

  return {
    httpStatus,
    failure,
    complete: !timedOut && status === "complete",
    timedOut,
    upstreamRequests,
    elapsedMs: elapsedMs(),
    firstResultsMs,
    resultCount,
    payloadJson: await collect(),
  };
}
