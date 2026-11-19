/** The normalized itinerary shape returned by this service. */
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

export interface FlightSegment {
  /** Marketing carrier code + number, e.g. `F93383`. */
  flightNumber: string;
  marketingCarrier: string;
  operatingCarrier: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  durationMinutes: number;
}

export interface FlightLeg {
  origin: Place;
  destination: Place;
  departure: string;
  arrival: string;
  durationMinutes: number;
  stops: number;
  carriers: Carrier[];
  segments: FlightSegment[];
}

export interface BookingOption {
  agentId: string;
  agentName: string;
  price: number;
  /** Absolute Skyscanner deeplink that redirects to the agent. */
  url: string;
}

export interface Itinerary {
  id: string;
  price: number;
  priceFormatted: string;
  /** Skyscanner's own "Best" score, 0..1. */
  score: number;
  tags: string[];
  /** Sum of all legs. */
  durationMinutes: number;
  /** Sum of all legs. */
  stops: number;
  isSelfTransfer: boolean;
  emissionsKg: number | null;
  legs: FlightLeg[];
  /** Cheapest first, at most five. */
  bookingOptions: BookingOption[];
}
