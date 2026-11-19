import { describe, expect, test } from "bun:test";
import { InvalidSearchUrlError } from "../../src/errors";
import { parseSearchUrl } from "../../src/skyscanner/search-url";

describe("parseSearchUrl", () => {
  test("parses a return search with passengers and cabin", () => {
    const parsed = parseSearchUrl(
      "https://www.skyscanner.co.in/transport/flights/san/sfo/261122/261202/?adultsv2=2&cabinclass=business&childrenv2=4|11",
    );
    expect(parsed).toEqual({
      query: { from: "san", to: "sfo", dates: ["2026-11-22", "2026-12-02"], adults: 2, childAges: [4, 11], cabinClass: "BUSINESS" },
      pathAndQuery: "/transport/flights/san/sfo/261122/261202/?adultsv2=2&cabinclass=business&childrenv2=4|11",
    });
  });

  test("defaults to one economy adult, one way", () => {
    const { query } = parseSearchUrl("https://www.skyscanner.com/transport/flights/LHR/JFK/261215/");
    expect(query).toEqual({ from: "lhr", to: "jfk", dates: ["2026-12-15"], adults: 1, childAges: [], cabinClass: "ECONOMY" });
  });

  test.each([
    "not a url",
    "https://example.com/transport/flights/lhr/jfk/261215/",
    "https://www.skyscanner.com/hotels/london",
    "https://www.skyscanner.com/transport/flights/lhr/jfk/2612/",
    "https://www.skyscanner.com/transport/flights/lhr/jfk/270229/",
    "https://www.skyscanner.com/transport/flights/lhr/jfk/261331/",
  ])("rejects %s", (url) => {
    expect(() => parseSearchUrl(url)).toThrow(InvalidSearchUrlError);
  });
});
