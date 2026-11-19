/**
 * Skyscanner's internal flight-search API, as used by its own web app:
 *   POST /g/radar/api/v2/web-unified-search/              → create (cached partial results)
 *   GET  /g/radar/api/v2/web-unified-search/{sessionId}   → poll until context.status === "complete"
 * Shapes below cover the fields this project reads; Skyscanner sends more.
 */
import type { CabinClass, FlightSearchQuery } from "./search-url";

export const UNIFIED_SEARCH_ENDPOINT = "/g/radar/api/v2/web-unified-search/";

// ---- Request ---------------------------------------------------------------

export interface Culture {
  market: string;
  locale: string;
  currency: string;
}

/** Skyscanner entity ids for a route; the search URL only has place codes. */
export interface RouteEntities {
  originEntityId: string;
  destinationEntityId: string;
  /** City entity of the destination; the web app sends it as the first leg's `placeOfStay`. */
  destinationCityEntityId?: string;
}

interface EntityRef {
  "@type": "entity";
  entityId: string;
}

interface DateRef {
  "@type": "date";
  year: string;
  month: string;
  day: string;
}

export interface UnifiedSearchLeg {
  legOrigin: EntityRef;
  legDestination: EntityRef;
  dates: DateRef;
  placeOfStay?: string;
}

export interface UnifiedSearchRequestBody {
  cabinClass: CabinClass;
  childAges: number[];
  adults: number;
  legs: UnifiedSearchLeg[];
}

const entityRef = (entityId: string): EntityRef => ({ "@type": "entity", entityId });

const dateRef = (isoDate: string): DateRef => {
  const [year = "", month = "", day = ""] = isoDate.split("-");
  return { "@type": "date", year, month, day };
};

/** One leg per date; the return leg reverses the route. */
export function buildUnifiedSearchBody(query: FlightSearchQuery, route: RouteEntities): UnifiedSearchRequestBody {
  const legs = query.dates.map((isoDate, index): UnifiedSearchLeg => {
    const isOutbound = index === 0;
    return {
      legOrigin: entityRef(isOutbound ? route.originEntityId : route.destinationEntityId),
      legDestination: entityRef(isOutbound ? route.destinationEntityId : route.originEntityId),
      dates: dateRef(isoDate),
      ...(isOutbound && route.destinationCityEntityId ? { placeOfStay: route.destinationCityEntityId } : {}),
    };
  });
  return { cabinClass: query.cabinClass, childAges: query.childAges, adults: query.adults, legs };
}

export function buildUnifiedSearchHeaders(culture: Culture): Record<string, string> {
  const viewId = crypto.randomUUID();
  return {
    accept: "application/json",
    "content-type": "application/json",
    "x-skyscanner-channelid": "website",
    "x-skyscanner-market": culture.market,
    "x-skyscanner-locale": culture.locale,
    "x-skyscanner-currency": culture.currency,
    "x-skyscanner-viewid": viewId,
    "x-skyscanner-trustedfunnelid": viewId,
    "x-skyscanner-consent-adverts": "false",
    "x-skyscanner-skip-accommodation-carhire": "true",
  };
}

// ---- Response --------------------------------------------------------------

export interface ApiPlace {
  id: string;
  entityId: string;
  name: string;
  displayCode: string;
  city?: string;
  country?: string;
}

export interface ApiCarrier {
  id: number;
  alternateId: string;
  name: string;
  logoUrl?: string;
}

export interface ApiSegmentCarrier {
  id: number;
  name: string;
  alternateId: string;
  displayCode: string;
}

export interface ApiSegment {
  id: string;
  origin: { displayCode: string; entityId: string; name: string };
  destination: { displayCode: string; entityId: string; name: string };
  departure: string;
  arrival: string;
  durationInMinutes: number;
  flightNumber: string;
  marketingCarrier: ApiSegmentCarrier;
  operatingCarrier?: ApiSegmentCarrier;
}

export interface ApiLeg {
  id: string;
  origin: ApiPlace;
  destination: ApiPlace;
  durationInMinutes: number;
  stopCount: number;
  departure: string;
  arrival: string;
  carriers: { marketing: ApiCarrier[]; operationType?: string };
  segments: ApiSegment[];
}

export interface ApiPricingOption {
  agentIds: string[];
  price: { amount: number; updateStatus?: string };
  items: { agentId: string; url: string; price: { amount: number } }[];
  pricingOptionId: string;
}

export interface ApiItinerary {
  id: string;
  price: { raw: number; formatted: string; pricingOptionId?: string };
  legs: ApiLeg[];
  isSelfTransfer: boolean;
  /** Skyscanner's own "Best" score, 0..1. */
  score: number;
  /** e.g. "cheapest", "shortest"; only on the top few itineraries. */
  tags?: string[] | null;
  emissions?: { emissionsKg: number } | null;
  pricingOptions: ApiPricingOption[];
}

export interface ApiAgent {
  id: string;
  name: string;
  isCarrier?: boolean;
  rating?: number;
}

export interface UnifiedSearchResponse {
  context: { status: "incomplete" | "complete"; sessionId: string };
  itineraries?: {
    results?: ApiItinerary[];
    agents?: ApiAgent[];
    context?: { status: string; sessionId: string; totalResults?: number };
  };
}
