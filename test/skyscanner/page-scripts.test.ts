import { afterEach, describe, expect, test } from "bun:test";
import { lookupRouteEntitiesInPage } from "../../src/skyscanner/page-scripts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
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
    expect(await lookupRouteEntitiesInPage({ pathAndQuery: "/x", timeoutMs: 1 })).toMatchObject({ status: 0, failure: "timeout" });
  });

  test("reports a connection failure as a network failure", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await lookupRouteEntitiesInPage({ pathAndQuery: "/x", timeoutMs: 1_000 })).toMatchObject({ status: 0, failure: "network" });
  });
});
