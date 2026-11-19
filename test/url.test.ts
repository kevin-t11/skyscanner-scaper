import { describe, expect, test } from "bun:test";
import { InvalidSearchUrl, parseSearchUrl } from "../src/url";

describe("parseSearchUrl", () => {
  test("parses a return search with passengers and cabin", () => {
    const q = parseSearchUrl(
      "https://www.skyscanner.co.in/transport/flights/san/sfo/261122/261202/?adultsv2=2&cabinclass=business&childrenv2=4|11&rtn=1",
    );
    expect(q).toEqual({
      from: "san",
      to: "sfo",
      dates: ["2026-11-22", "2026-12-02"],
      adults: 2,
      childAges: [4, 11],
      cabin: "BUSINESS",
      path: "/transport/flights/san/sfo/261122/261202/?adultsv2=2&cabinclass=business&childrenv2=4|11&rtn=1",
    });
  });

  test("defaults to one economy adult, one way", () => {
    const q = parseSearchUrl("https://www.skyscanner.com/transport/flights/LHR/JFK/261215/");
    expect(q.dates).toEqual(["2026-12-15"]);
    expect(q).toMatchObject({ from: "lhr", to: "jfk", adults: 1, childAges: [], cabin: "ECONOMY" });
  });

  test.each([
    "not a url",
    "https://example.com/transport/flights/lhr/jfk/261215/",
    "https://www.skyscanner.com/hotels/london",
    "https://www.skyscanner.com/transport/flights/lhr/jfk/2612/",
  ])("rejects %s", (url) => {
    expect(() => parseSearchUrl(url)).toThrow(InvalidSearchUrl);
  });
});
