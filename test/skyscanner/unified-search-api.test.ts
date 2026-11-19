import { describe, expect, test } from "bun:test";
import { parseSearchUrl } from "../../src/skyscanner/search-url";
import { buildUnifiedSearchBody } from "../../src/skyscanner/unified-search-api";

describe("buildUnifiedSearchBody", () => {
  test("matches the request the Skyscanner web app sends for a return trip", () => {
    const { query } = parseSearchUrl("https://www.skyscanner.co.in/transport/flights/san/sfo/261122/261202/?adultsv2=1");
    const route = { originEntityId: "95673473", destinationEntityId: "95673577", destinationCityEntityId: "27546320" };
    expect(buildUnifiedSearchBody(query, route)).toEqual({
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
