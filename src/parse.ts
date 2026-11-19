/** Normalizes raw `web-unified-search` itineraries into a compact, stable shape and sorts them. */
export type SortOrder = "best" | "cheapest" | "fastest";
export const SORT_ORDERS: readonly SortOrder[] = ["best", "cheapest", "fastest"];

export interface Place {
  code: string;
  name: string;
  city?: string;
  entityId: string;
}

export interface Carrier {
  code: string;
  name: string;
  logoUrl?: string;
}

export interface Segment {
  flightNumber: string;
  marketingCarrier: string;
  operatingCarrier: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  durationMinutes: number;
}

export interface Leg {
  origin: Place;
  destination: Place;
  departure: string;
  arrival: string;
  durationMinutes: number;
  stops: number;
  carriers: Carrier[];
  segments: Segment[];
}

export interface BookingOption {
  agentId: string;
  agentName: string;
  price: number;
  url: string;
}

export interface Itinerary {
  id: string;
  price: number;
  priceFormatted: string;
  /** Skyscanner's own "Best" score, 0..1. */
  score: number;
  tags: string[];
  durationMinutes: number;
  stops: number;
  isSelfTransfer: boolean;
  emissionsKg: number | null;
  legs: Leg[];
  bookingOptions: BookingOption[];
}

interface RawPayload {
  results: any[];
  agents: { id: string; name: string }[];
}

const MAX_BOOKING_OPTIONS = 5;

const place = (raw: any): Place => ({
  code: raw?.displayCode ?? raw?.id ?? "",
  name: raw?.name ?? "",
  city: raw?.city,
  entityId: String(raw?.entityId ?? ""),
});

const leg = (raw: any): Leg => ({
  origin: place(raw.origin),
  destination: place(raw.destination),
  departure: raw.departure,
  arrival: raw.arrival,
  durationMinutes: raw.durationInMinutes ?? 0,
  stops: raw.stopCount ?? 0,
  carriers: (raw.carriers?.marketing ?? []).map((c: any) => ({ code: c.alternateId, name: c.name, logoUrl: c.logoUrl })),
  segments: (raw.segments ?? []).map((s: any) => ({
    flightNumber: `${s.marketingCarrier?.displayCode ?? ""}${s.flightNumber ?? ""}`,
    marketingCarrier: s.marketingCarrier?.name ?? "",
    operatingCarrier: s.operatingCarrier?.name ?? s.marketingCarrier?.name ?? "",
    origin: s.origin?.displayCode ?? "",
    destination: s.destination?.displayCode ?? "",
    departure: s.departure,
    arrival: s.arrival,
    durationMinutes: s.durationInMinutes ?? 0,
  })),
});

export function normalizeItinerary(raw: any, agentNames: Map<string, string>, origin: string): Itinerary {
  const legs: Leg[] = (raw.legs ?? []).map(leg);
  const bookingOptions = (raw.pricingOptions ?? [])
    .map((option: any): BookingOption | null => {
      const agentId = option.agentIds?.[0] ?? option.items?.[0]?.agentId;
      const url = option.items?.[0]?.url;
      const price = option.price?.amount;
      if (!agentId || !url || typeof price !== "number") return null;
      return { agentId, agentName: agentNames.get(agentId) ?? agentId, price, url: new URL(url, origin).href };
    })
    .filter((option: BookingOption | null): option is BookingOption => option !== null)
    .sort((a: BookingOption, b: BookingOption) => a.price - b.price)
    .slice(0, MAX_BOOKING_OPTIONS);

  return {
    id: raw.id,
    price: raw.price?.raw ?? bookingOptions[0]?.price ?? Number.POSITIVE_INFINITY,
    priceFormatted: raw.price?.formatted ?? "",
    score: raw.score ?? 0,
    tags: raw.tags ?? [],
    durationMinutes: legs.reduce((sum, l) => sum + l.durationMinutes, 0),
    stops: legs.reduce((sum, l) => sum + l.stops, 0),
    isSelfTransfer: Boolean(raw.isSelfTransfer),
    emissionsKg: raw.emissions?.emissionsKg ?? null,
    legs,
    bookingOptions,
  };
}

const COMPARATORS: Record<SortOrder, (a: Itinerary, b: Itinerary) => number> = {
  best: (a, b) => b.score - a.score || a.price - b.price,
  cheapest: (a, b) => a.price - b.price || a.durationMinutes - b.durationMinutes,
  fastest: (a, b) => a.durationMinutes - b.durationMinutes || a.price - b.price,
};

/** Parses the page payload, drops unpriced itineraries, sorts and keeps the first `max`. */
export function parseResults(payload: string | RawPayload, sort: SortOrder, max: number, origin: string) {
  const data: RawPayload = typeof payload === "string" ? JSON.parse(payload) : payload;
  const agentNames = new Map(data.agents.map((agent) => [agent.id, agent.name]));
  const itineraries = data.results
    .map((raw) => normalizeItinerary(raw, agentNames, origin))
    .filter((it) => Number.isFinite(it.price))
    .sort(COMPARATORS[sort]);
  return { total: itineraries.length, itineraries: itineraries.slice(0, max) };
}
