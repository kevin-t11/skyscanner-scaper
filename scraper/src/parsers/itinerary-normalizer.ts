/** Turns raw `web-unified-search` itineraries into `Itinerary` objects and ranks them. */
import type { UnifiedSearchPayload } from "../skyscanner/page-scripts";
import type { ApiItinerary, ApiLeg, ApiPlace, ApiPricingOption } from "../skyscanner/unified-search-api";
import type { BookingOption, FlightLeg, Itinerary, Place, SortOrder } from "../types/itinerary";

const MAX_BOOKING_OPTIONS = 5;

/** Skyscanner occasionally omits place fields; missing values become empty strings. */
const toPlace = (place: Partial<ApiPlace> | undefined): Place => ({
  code: place?.displayCode ?? place?.id ?? "",
  name: place?.name ?? "",
  city: place?.city,
  entityId: place?.entityId ? String(place.entityId) : "",
});

const toLeg = (leg: ApiLeg): FlightLeg => ({
  origin: toPlace(leg.origin),
  destination: toPlace(leg.destination),
  departure: leg.departure,
  arrival: leg.arrival,
  durationMinutes: leg.durationInMinutes ?? 0,
  stops: leg.stopCount ?? 0,
  carriers: (leg.carriers?.marketing ?? []).map((carrier) => ({
    code: carrier.alternateId,
    name: carrier.name,
    logoUrl: carrier.logoUrl,
  })),
  segments: (leg.segments ?? []).map((segment) => ({
    flightNumber: `${segment.marketingCarrier?.displayCode ?? ""}${segment.flightNumber ?? ""}`,
    marketingCarrier: segment.marketingCarrier?.name ?? "",
    operatingCarrier: segment.operatingCarrier?.name ?? segment.marketingCarrier?.name ?? "",
    origin: segment.origin?.displayCode ?? "",
    destination: segment.destination?.displayCode ?? "",
    departure: segment.departure,
    arrival: segment.arrival,
    durationMinutes: segment.durationInMinutes ?? 0,
  })),
});

function toBookingOption(option: ApiPricingOption, agentNames: Map<string, string>, siteOrigin: string): BookingOption | null {
  const agentId = option.agentIds?.[0] ?? option.items?.[0]?.agentId;
  const url = option.items?.[0]?.url;
  const price = option.price?.amount;
  if (!agentId || !url || typeof price !== "number") return null;
  return { agentId, agentName: agentNames.get(agentId) ?? agentId, price, url: new URL(url, siteOrigin).href };
}

export function normalizeItinerary(raw: ApiItinerary, agentNames: Map<string, string>, siteOrigin: string): Itinerary {
  const legs = (raw.legs ?? []).map(toLeg);
  const bookingOptions = (raw.pricingOptions ?? [])
    .map((option) => toBookingOption(option, agentNames, siteOrigin))
    .filter((option): option is BookingOption => option !== null)
    .sort((a, b) => a.price - b.price)
    .slice(0, MAX_BOOKING_OPTIONS);

  return {
    id: raw.id,
    price: raw.price?.raw ?? bookingOptions[0]?.price ?? Number.POSITIVE_INFINITY,
    priceFormatted: raw.price?.formatted ?? "",
    score: raw.score ?? 0,
    tags: raw.tags ?? [],
    durationMinutes: legs.reduce((total, leg) => total + leg.durationMinutes, 0),
    stops: legs.reduce((total, leg) => total + leg.stops, 0),
    isSelfTransfer: Boolean(raw.isSelfTransfer),
    emissionsKg: raw.emissions?.emissionsKg ?? null,
    legs,
    bookingOptions,
  };
}

const COMPARE_BY: Record<SortOrder, (a: Itinerary, b: Itinerary) => number> = {
  best: (a, b) => b.score - a.score || a.price - b.price,
  cheapest: (a, b) => a.price - b.price || a.durationMinutes - b.durationMinutes,
  fastest: (a, b) => a.durationMinutes - b.durationMinutes || a.price - b.price,
};

export interface ItineraryCounts {
  /** Itineraries Skyscanner returned. */
  received: number;
  /** Parsed successfully and priced. */
  passed: number;
  /** Dropped: no price or malformed data. */
  failed: number;
}

export interface RankedItineraries {
  counts: ItineraryCounts;
  /** The first `maxItems` after sorting. */
  itineraries: Itinerary[];
}

/** Normalizes the payload, drops unpriced itineraries, sorts, and keeps the first `maxItems`. */
export function rankItineraries(
  payload: UnifiedSearchPayload | string,
  sort: SortOrder,
  maxItems: number,
  siteOrigin: string,
): RankedItineraries {
  const { results, agents }: UnifiedSearchPayload = typeof payload === "string" ? JSON.parse(payload) : payload;
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));
  const itineraries: Itinerary[] = [];
  for (const raw of results) {
    try {
      const itinerary = normalizeItinerary(raw, agentNames, siteOrigin);
      if (Number.isFinite(itinerary.price)) itineraries.push(itinerary);
    } catch {
      // Counted as failed below; one malformed itinerary must not fail the search.
    }
  }
  itineraries.sort(COMPARE_BY[sort]);
  const counts = { received: results.length, passed: itineraries.length, failed: results.length - itineraries.length };
  return { counts, itineraries: itineraries.slice(0, maxItems) };
}
