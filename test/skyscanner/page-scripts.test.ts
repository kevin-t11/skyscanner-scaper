import { afterEach, describe, expect, test } from "bun:test";
import {
  lookupRouteEntitiesInPage,
  runUnifiedSearchInPage,
  toPageExpression,
  type UnifiedSearchArgs,
  type UnifiedSearchOutcome,
} from "../../src/skyscanner/page-scripts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const searchArgs = (overrides: Partial<UnifiedSearchArgs> = {}): UnifiedSearchArgs => ({
  endpoint: "/e/",
  headers: {},
  body: { cabinClass: "ECONOMY", childAges: [], adults: 1, legs: [] },
  enoughResults: 10,
  stopWhenEnough: false,
  deadlineMs: 5_000,
  pollIntervalMs: 1,
  ...overrides,
});

describe("runUnifiedSearchInPage", () => {
  test("polls until complete and merges results across polls", async () => {
    const responses = [
      { context: { status: "incomplete", sessionId: "s/1" }, itineraries: { results: [{ id: "a" }], agents: [{ id: "x" }] } },
      { context: { status: "incomplete", sessionId: "s2" }, itineraries: { results: [] } },
      { context: { status: "complete", sessionId: "s3" }, itineraries: { results: [{ id: "a" }, { id: "b" }] } },
    ];
    const urls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      urls.push(url);
      return Response.json(responses.shift());
    }) as typeof fetch;

    // Evaluate the serialized form, exactly as the browser receives it.
    const outcome: UnifiedSearchOutcome = await (0, eval)(toPageExpression(runUnifiedSearchInPage, searchArgs()));
    expect(outcome).toMatchObject({ complete: true, timedOut: false, upstreamRequests: 3, resultCount: 2 });
    expect(urls).toEqual(["/e/", "/e/s%2F1", "/e/s2"]);
    expect(JSON.parse(outcome.payloadJson).results.map((r: { id: string }) => r.id)).toEqual(["a", "b"]);
  });

  test("the deadline aborts a stalled poll and keeps earlier results", async () => {
    let calls = 0;
    globalThis.fetch = ((_url: string, init: RequestInit) => {
      if (calls++ === 0) {
        return Promise.resolve(Response.json({ context: { status: "incomplete", sessionId: "s" }, itineraries: { results: [{ id: "a" }] } }));
      }
      return new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    }) as typeof fetch;

    const startedAt = performance.now();
    const outcome = await runUnifiedSearchInPage(searchArgs({ deadlineMs: 100 }));
    expect(performance.now() - startedAt).toBeLessThan(1_000);
    expect(outcome).toMatchObject({ timedOut: true, complete: false, resultCount: 1, httpStatus: 200 });
  });

  test("marks the search timed out when no time is left for another poll", async () => {
    globalThis.fetch = (async () => Response.json({ context: { status: "incomplete", sessionId: "s" }, itineraries: { results: [] } })) as unknown as typeof fetch;
    const outcome = await runUnifiedSearchInPage(searchArgs({ deadlineMs: 50, pollIntervalMs: 100 }));
    expect(outcome).toMatchObject({ timedOut: true, complete: false, resultCount: 0, upstreamRequests: 1 });
  });
});

describe("lookupRouteEntitiesInPage", () => {
  test("extracts entity ids from the server-rendered search page", async () => {
    const html = `"legs":[{"originEntityId":"95565050","destinationEntityId":"95565058"}],"destination":{"entityId":"95565058","id":"JFK","geoContainerId":"27537542"}`;
    globalThis.fetch = (async () => new Response(html)) as unknown as typeof fetch;
    expect(await lookupRouteEntitiesInPage({ pathAndQuery: "/transport/flights/lhr/jfk/261215/", timeoutMs: 1_000 })).toMatchObject({
      status: 200,
      originEntityId: "95565050",
      destinationEntityId: "95565058",
      destinationCityEntityId: "27537542",
    });
  });

  test("reports a timeout as status 0 instead of throwing", async () => {
    globalThis.fetch = (async () => {
      throw new DOMException("timed out", "TimeoutError");
    }) as unknown as typeof fetch;
    expect((await lookupRouteEntitiesInPage({ pathAndQuery: "/x", timeoutMs: 1 })).status).toBe(0);
  });
});
