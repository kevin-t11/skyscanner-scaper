import { describe, expect, test } from "bun:test";
import { rankItineraries } from "../../src/skyscanner/itinerary-normalizer";
import type { Itinerary, SortOrder } from "../../src/skyscanner/itinerary";
import type { UnifiedSearchPayload } from "../../src/skyscanner/page-scripts";
import fixture from "../fixtures/web-unified-search.san-sfo.json";

const payload = { results: fixture.itineraries.results, agents: fixture.itineraries.agents } as unknown as UnifiedSearchPayload;
const SITE_ORIGIN = "https://www.skyscanner.co.in";

describe("rankItineraries", () => {
  test("normalizes a live itinerary", () => {
    const [itinerary] = rankItineraries(payload, "cheapest", 1, SITE_ORIGIN).itineraries;
    expect(itinerary!.price).toBe(16717.29);
    expect(itinerary!.priceFormatted).toBe("₹16,718");
    expect(itinerary!.tags).toEqual(["cheapest"]);
    expect(itinerary!.legs).toHaveLength(2);
    expect(itinerary!.legs[0]!.origin.code).toBe("SAN");
    expect(itinerary!.legs[0]!.segments[0]!.flightNumber).toMatch(/^F9\d+$/);
    expect(itinerary!.durationMinutes).toBe(itinerary!.legs[0]!.durationMinutes + itinerary!.legs[1]!.durationMinutes);
    expect(itinerary!.bookingOptions[0]!.url.startsWith(`${SITE_ORIGIN}/transport_deeplink/`)).toBe(true);
    expect(itinerary!.bookingOptions[0]!.agentName).not.toBe(itinerary!.bookingOptions[0]!.agentId);
  });

  const sortKey: Record<SortOrder, (itinerary: Itinerary) => number> = {
    best: (itinerary) => -itinerary.score,
    cheapest: (itinerary) => itinerary.price,
    fastest: (itinerary) => itinerary.durationMinutes,
  };

  test.each(["best", "cheapest", "fastest"] as const)("sorts by %s", (sort) => {
    const { itineraries, counts } = rankItineraries(JSON.stringify(payload), sort, 10, SITE_ORIGIN);
    expect(counts).toEqual({ received: payload.results.length, passed: payload.results.length, failed: 0 });
    const keys = itineraries.map(sortKey[sort]);
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
  });

  test("tolerates legs without origin or destination", () => {
    const raw = structuredClone(payload.results[0]!);
    delete (raw.legs[0] as { origin?: unknown }).origin;
    const [itinerary] = rankItineraries({ results: [raw], agents: [] }, "best", 1, SITE_ORIGIN).itineraries;
    expect(itinerary!.legs[0]!.origin).toEqual({ code: "", name: "", city: undefined, entityId: "" });
  });

  test("keeps at most maxItems", () => {
    expect(rankItineraries(payload, "best", 2, SITE_ORIGIN).itineraries).toHaveLength(2);
  });
});
