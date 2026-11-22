/** Shapes returned by the scraper's `GET /places` and `POST /search`. */

export type SortOrder = "best" | "cheapest" | "fastest";
export type CabinClass = "economy" | "premium_economy" | "business" | "first";

export interface Place {
  name: string;
  code: string;
  iata: string | null;
  type: "city" | "airport" | "country";
  entityId: string;
  city: string;
  country: string;
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
  origin: { code: string; name: string; city?: string };
  destination: { code: string; name: string; city?: string };
  departure: string;
  arrival: string;
  durationMinutes: number;
  stops: number;
  carriers: { code: string; name: string; logoUrl?: string }[];
  segments: Segment[];
}

export interface Itinerary {
  id: string;
  price: number;
  priceFormatted: string;
  score: number;
  tags: string[];
  durationMinutes: number;
  stops: number;
  isSelfTransfer: boolean;
  emissionsKg: number | null;
  legs: Leg[];
  bookingOptions: { agentId: string; agentName: string; price: number; url: string }[];
}

/** Skyscanner prices a child under 2 as an infant, travelling on an adult's lap. */
export const INFANT_AGE_LIMIT = 2;

export interface Travellers {
  adults: number;
  childAges: number[];
}

export interface SearchRequest {
  from: string;
  to: string;
  departDate: string;
  returnDate?: string;
  cabinClass: CabinClass;
  adults: number;
  childAges?: number[];
  max: number;
  sort: SortOrder;
}

export interface SearchResponse {
  status: "pass" | "fail";
  timeElapsedMs: number;
  request: { searchUrl?: string };
  result: {
    complete: boolean;
    counts: { total: number; failed: number; returned: number };
    searchUrl?: string;
    itineraries: Itinerary[];
  } | null;
  failed: { code: string; message: string } | null;
}

export const CABIN_LABELS: Record<CabinClass, string> = {
  economy: "Economy",
  premium_economy: "Premium economy",
  business: "Business",
  first: "First",
};

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** Skyscanner times are local to the airport, without a zone: keep them as written. */
export function formatTime(iso: string): string {
  return iso.slice(11, 16);
}

export function formatDay(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function stopsLabel(stops: number): string {
  return stops === 0 ? "Direct" : stops === 1 ? "1 stop" : `${stops} stops`;
}

export function sortItineraries(items: Itinerary[], sort: SortOrder): Itinerary[] {
  const sorted = [...items];
  if (sort === "cheapest") sorted.sort((a, b) => a.price - b.price || a.durationMinutes - b.durationMinutes);
  else if (sort === "fastest") sorted.sort((a, b) => a.durationMinutes - b.durationMinutes || a.price - b.price);
  else sorted.sort((a, b) => b.score - a.score);
  return sorted;
}
