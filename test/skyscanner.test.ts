import { describe, expect, test } from "bun:test";
import { buildSearchBody, pageCall, pageSearch } from "../src/skyscanner";
import { parseSearchUrl } from "../src/url";

describe("buildSearchBody", () => {
  test("matches the web app's request for a return trip", () => {
    const query = parseSearchUrl("https://www.skyscanner.co.in/transport/flights/san/sfo/261122/261202/?adultsv2=1");
    // Same body as a request captured from the Skyscanner web app.
    expect(buildSearchBody(query, { origin: "95673473", destination: "95673577", placeOfStay: "27546320" })).toEqual({
      cabinClass: "ECONOMY",
      childAges: [],
      adults: 1,
      legs: [
        {
          legOrigin: { "@type": "entity", entityId: "95673473" },
          legDestination: { "@type": "entity", entityId: "95673577" },
          dates: { "@type": "date", year: "2026", month: "11", day: "22" },
          placeOfStay: "27546320",
        },
        {
          legOrigin: { "@type": "entity", entityId: "95673577" },
          legDestination: { "@type": "entity", entityId: "95673473" },
          dates: { "@type": "date", year: "2026", month: "12", day: "02" },
        },
      ],
    });
  });
});

describe("pageSearch", () => {
  test("polls until complete and merges results across polls", async () => {
    const responses = [
      { context: { status: "incomplete", sessionId: "s/1" }, itineraries: { results: [{ id: "a" }], agents: [{ id: "x" }] } },
      { context: { status: "incomplete", sessionId: "s2" }, itineraries: { results: [] } },
      { context: { status: "complete", sessionId: "s3" }, itineraries: { results: [{ id: "a" }, { id: "b" }] } },
    ];
    const urls: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      urls.push(url);
      return Response.json(responses.shift());
    }) as typeof fetch;
    try {
      // Evaluate the serialized form, exactly as the browser receives it.
      const result = await (0, eval)(
        pageCall(pageSearch, { endpoint: "/e/", headers: {}, body: {}, want: 10, fast: false, deadlineMs: 5000, pollIntervalMs: 1 }),
      );
      expect(result.complete).toBe(true);
      expect(result.requests).toBe(3);
      expect(urls).toEqual(["/e/", "/e/s%2F1", "/e/s2"]);
      expect(JSON.parse(result.payload).results.map((r: { id: string }) => r.id)).toEqual(["a", "b"]);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
