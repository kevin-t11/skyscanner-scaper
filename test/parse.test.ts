import { describe, expect, test } from "bun:test";
import fixture from "./fixtures/web-unified-search.san-sfo.json";
import { parseResults } from "../src/parse";

const payload = { results: fixture.itineraries.results, agents: fixture.itineraries.agents };
const ORIGIN = "https://www.skyscanner.co.in";

describe("parseResults", () => {
  test("normalizes a live itinerary", () => {
    const { itineraries } = parseResults(payload, "cheapest", 1, ORIGIN);
    const it = itineraries[0]!;
    expect(it.price).toBe(16717.29);
    expect(it.priceFormatted).toBe("₹16,718");
    expect(it.tags).toEqual(["cheapest"]);
    expect(it.legs).toHaveLength(2);
    expect(it.legs[0]!.origin.code).toBe("SAN");
    expect(it.legs[0]!.segments[0]!.flightNumber).toMatch(/^F9\d+$/);
    expect(it.durationMinutes).toBe(it.legs[0]!.durationMinutes + it.legs[1]!.durationMinutes);
    expect(it.bookingOptions[0]!.url.startsWith(`${ORIGIN}/transport_deeplink/`)).toBe(true);
    expect(it.bookingOptions[0]!.agentName).not.toBe(it.bookingOptions[0]!.agentId);
  });

  test.each(["best", "cheapest", "fastest"] as const)("sorts by %s", (sort) => {
    const { itineraries, total } = parseResults(JSON.stringify(payload), sort, 10, ORIGIN);
    expect(total).toBe(payload.results.length);
    const key = { best: (i: any) => -i.score, cheapest: (i: any) => i.price, fastest: (i: any) => i.durationMinutes }[sort];
    const values = itineraries.map(key);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  test("limits to max", () => {
    expect(parseResults(payload, "best", 2, ORIGIN).itineraries).toHaveLength(2);
  });
});
