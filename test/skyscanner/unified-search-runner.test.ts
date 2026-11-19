import { afterEach, describe, expect, test } from "bun:test";
import {
  runUnifiedSearch,
  type PageEvaluator,
  type UnifiedSearchOptions,
  type UnifiedSearchProgress,
} from "../../src/skyscanner/unified-search-runner";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Evaluates the serialized page scripts here, exactly as Chrome receives them. */
const page: PageEvaluator = { evaluate: async <T>(expression: string) => (await (0, eval)(expression)) as T };

const options = (overrides: Partial<UnifiedSearchOptions> = {}): UnifiedSearchOptions => ({
  endpoint: "/e/",
  headers: {},
  body: { cabinClass: "ECONOMY", childAges: [], adults: 1, legs: [] },
  deadlineMs: 5_000,
  pollIntervalMs: 1,
  ...overrides,
});

const searchStateKeys = () => Object.keys(globalThis).filter((key) => key.startsWith("__search_"));

describe("runUnifiedSearch", () => {
  test("polls until complete, merges results across polls, and reports each step", async () => {
    const responses = [
      { context: { status: "incomplete", sessionId: "s/1" }, itineraries: { results: [{ id: "a" }], agents: [{ id: "x" }] } },
      { context: { status: "incomplete", sessionId: "s2" }, itineraries: { results: [] } },
      { context: { status: "complete", sessionId: "s3" }, itineraries: { results: [{ id: "a" }, { id: "b" }] } },
    ];
    const urls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      urls.push(url);
      return Response.json(responses.shift());
    }) as unknown as typeof fetch;

    const progress: UnifiedSearchProgress[] = [];
    const outcome = await runUnifiedSearch(page, options(), (step) => progress.push(step));
    expect(outcome).toMatchObject({ complete: true, timedOut: false, upstreamRequests: 3, resultCount: 2 });
    expect(urls).toEqual(["/e/", "/e/s%2F1", "/e/s2"]);
    expect(JSON.parse(outcome.payloadJson).results.map((r: { id: string }) => r.id)).toEqual(["a", "b"]);
    expect(progress.map(({ step, resultCount, newResults }) => [step, resultCount, newResults])).toEqual([
      [1, 1, 1],
      [2, 1, 0],
      [3, 2, 1],
    ]);
    expect(searchStateKeys()).toEqual([]);
  });

  test("the deadline aborts a stalled poll and keeps earlier results", async () => {
    let calls = 0;
    globalThis.fetch = ((_url: string, init: RequestInit) => {
      if (calls++ === 0) {
        return Promise.resolve(Response.json({ context: { status: "incomplete", sessionId: "s" }, itineraries: { results: [{ id: "a" }] } }));
      }
      return new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)));
    }) as unknown as typeof fetch;

    const startedAt = performance.now();
    const outcome = await runUnifiedSearch(page, options({ deadlineMs: 100 }));
    expect(performance.now() - startedAt).toBeLessThan(1_000);
    expect(outcome).toMatchObject({ timedOut: true, complete: false, resultCount: 1, httpStatus: 200 });
  });

  test("a network failure is httpStatus 0 and keeps earlier results", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      if (calls++ === 0) return Response.json({ context: { status: "incomplete", sessionId: "s" }, itineraries: { results: [{ id: "a" }] } });
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await runUnifiedSearch(page, options())).toMatchObject({ httpStatus: 0, failure: "network", complete: false, resultCount: 1 });
  });

  test("a connection drop while reading a 200 body is a network failure", async () => {
    const brokenBody = new ReadableStream({ pull: (controller) => controller.error(new TypeError("network error")) });
    globalThis.fetch = (async () => new Response(brokenBody, { status: 200 })) as unknown as typeof fetch;
    expect(await runUnifiedSearch(page, options())).toMatchObject({ httpStatus: 0, failure: "network", resultCount: 0 });
  });

  test("invalid JSON in a 200 response is malformed, not a network failure", async () => {
    globalThis.fetch = (async () => new Response("<html>oops</html>", { status: 200 })) as unknown as typeof fetch;
    expect(await runUnifiedSearch(page, options())).toMatchObject({
      httpStatus: 200,
      failure: "malformed",
      complete: false,
      resultCount: 0,
      upstreamRequests: 1,
    });
  });

  test("a 403 stops polling and reports the status", async () => {
    globalThis.fetch = (async () => Response.json({ reason: "blocked" }, { status: 403 })) as unknown as typeof fetch;
    expect(await runUnifiedSearch(page, options())).toMatchObject({ httpStatus: 403, resultCount: 0, upstreamRequests: 1 });
  });
});
