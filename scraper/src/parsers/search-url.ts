/**
 * Parses a Skyscanner flight search URL:
 *   https://www.skyscanner.com/transport/flights/{from}/{to}/{yymmdd}/[{yymmdd}/]?adultsv2=1&cabinclass=economy&childrenv2=4|9
 */
import { InvalidSearchUrlError } from "../errors";
import type { Place } from "../skyscanner/places";

export type CabinClass = "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS" | "FIRST";

export interface FlightSearchQuery {
  /** Skyscanner place codes from the path, lower-case (airport `lhr` or city `lond`). */
  from: string;
  to: string;
  /** ISO dates, one per leg: outbound and an optional return. */
  dates: string[];
  adults: number;
  childAges: number[];
  cabinClass: CabinClass;
}

export interface ParsedSearchUrl {
  query: FlightSearchQuery;
  /** Path and query string, used to fetch the search page on the session's own host. */
  pathAndQuery: string;
}

const CABIN_CLASSES: Record<string, CabinClass> = {
  economy: "ECONOMY",
  premiumeconomy: "PREMIUM_ECONOMY",
  business: "BUSINESS",
  first: "FIRST",
};
const MAX_PASSENGERS_PER_TYPE = 8;

function parseDateSegment(yymmdd: string): string {
  if (!/^\d{6}$/.test(yymmdd)) throw new InvalidSearchUrlError(`bad date segment: ${yymmdd}`);
  const iso = `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
  // Date.parse rolls impossible dates over (2027-02-29 → 2027-03-01); require an exact round trip.
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) {
    throw new InvalidSearchUrlError(`bad date: ${yymmdd}`);
  }
  return iso;
}

export function parseSearchUrl(searchUrl: string): ParsedSearchUrl {
  let url: URL;
  try {
    url = new URL(searchUrl);
  } catch {
    throw new InvalidSearchUrlError("url is not a valid URL");
  }
  if (!/(^|\.)skyscanner\.[a-z.]+$/.test(url.hostname)) {
    throw new InvalidSearchUrlError("url must be a skyscanner domain");
  }

  // ["transport", "flights", from, to, outboundDate, returnDate?]
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0] !== "transport" || segments[1] !== "flights" || segments.length < 5) {
    throw new InvalidSearchUrlError("expected /transport/flights/{from}/{to}/{yymmdd}/");
  }
  const [from, to, ...dateSegments] = segments.slice(2) as [string, string, ...string[]];

  const params = url.searchParams;
  const adults = Number.parseInt(params.get("adultsv2") ?? params.get("adults") ?? "1", 10);
  const childAges = (params.get("childrenv2") ?? "")
    .split("|")
    .filter(Boolean)
    .map((age) => Number.parseInt(age, 10))
    .filter((age) => age >= 0 && age < 18);

  return {
    query: {
      from: from.toLowerCase(),
      to: to.toLowerCase(),
      dates: dateSegments.slice(0, 2).map(parseDateSegment),
      adults: Number.isFinite(adults) && adults > 0 ? Math.min(adults, MAX_PASSENGERS_PER_TYPE) : 1,
      childAges: childAges.slice(0, MAX_PASSENGERS_PER_TYPE),
      cabinClass: CABIN_CLASSES[(params.get("cabinclass") ?? "economy").toLowerCase()] ?? "ECONOMY",
    },
    pathAndQuery: url.pathname + url.search,
  };
}

/** The website URL for a search. */
export function buildSearchUrl(origin: string, query: FlightSearchQuery, places: { from: Place | null; to: Place | null }): string {
  return origin + buildSearchPath(query, places);
}

/** Path and query of the website search: `/transport/flights/{from}/{to}/{yymmdd}/[{yymmdd}/]?adultsv2=…`. */
export function buildSearchPath(query: FlightSearchQuery, places: { from: Place | null; to: Place | null }): string {
  const code = (place: Place | null, text: string) => encodeURIComponent((place?.code ?? text).toLowerCase());
  const dates = query.dates.map((iso) => `${iso.slice(2).replaceAll("-", "")}/`).join("");
  const params = new URLSearchParams({ adultsv2: String(query.adults), cabinclass: query.cabinClass.toLowerCase().replace("_", "") });
  if (query.childAges.length) params.set("childrenv2", query.childAges.join("|"));
  return `/transport/flights/${code(places.from, query.from)}/${code(places.to, query.to)}/${dates}?${params}`;
}
