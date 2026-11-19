/**
 * Parses a Skyscanner flight search URL:
 *   https://www.skyscanner.com/transport/flights/{from}/{to}/{yymmdd}/[{yymmdd}/]?adultsv2=1&cabinclass=economy&childrenv2=4|9
 */
export type Cabin = "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS" | "FIRST";

export interface SearchQuery {
  /** Skyscanner place codes from the path, lower-case (airport `lhr` or city `lond`). */
  from: string;
  to: string;
  /** ISO dates, one per leg (outbound, optional return). */
  dates: string[];
  adults: number;
  childAges: number[];
  cabin: Cabin;
  /** Path + query, reused to resolve entity ids from the search page. */
  path: string;
}

const CABINS: Record<string, Cabin> = {
  economy: "ECONOMY",
  premiumeconomy: "PREMIUM_ECONOMY",
  business: "BUSINESS",
  first: "FIRST",
};

export class InvalidSearchUrl extends Error {}

const toIsoDate = (yymmdd: string): string => {
  if (!/^\d{6}$/.test(yymmdd)) throw new InvalidSearchUrl(`bad date segment: ${yymmdd}`);
  const iso = `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
  if (Number.isNaN(Date.parse(iso))) throw new InvalidSearchUrl(`bad date: ${yymmdd}`);
  return iso;
};

export function parseSearchUrl(raw: string): SearchQuery {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InvalidSearchUrl("url is not a valid URL");
  }
  if (!/(^|\.)skyscanner\.[a-z.]+$/.test(url.hostname)) {
    throw new InvalidSearchUrl("url must be a skyscanner domain");
  }
  const parts = url.pathname.split("/").filter(Boolean);
  // ["transport", "flights", from, to, date, returnDate?]
  if (parts[0] !== "transport" || parts[1] !== "flights" || parts.length < 5) {
    throw new InvalidSearchUrl("expected /transport/flights/{from}/{to}/{yymmdd}/");
  }
  const [from, to, ...dateParts] = parts.slice(2) as [string, string, ...string[]];
  const dates = dateParts.slice(0, 2).map(toIsoDate);

  const q = url.searchParams;
  const adults = Number.parseInt(q.get("adultsv2") ?? q.get("adults") ?? "1", 10);
  const childAges = (q.get("childrenv2") ?? "")
    .split("|")
    .filter(Boolean)
    .map((age) => Number.parseInt(age, 10))
    .filter((age) => age >= 0 && age < 18);
  const cabin = CABINS[(q.get("cabinclass") ?? "economy").toLowerCase()] ?? "ECONOMY";

  return {
    from: from.toLowerCase(),
    to: to.toLowerCase(),
    dates,
    adults: Number.isFinite(adults) && adults > 0 ? Math.min(adults, 8) : 1,
    childAges: childAges.slice(0, 8),
    cabin,
    path: url.pathname + url.search,
  };
}
