/**
 * Skyscanner's place autocomplete (the "From" / "To" boxes on the home page):
 *   GET /g/autosuggest-search/api/v1/search-flight/{market}/{locale}/{text}?isDestination=…
 * Each suggestion's `GeoId` is the entity id the flight search API takes.
 */

export type PlaceType = "city" | "airport" | "country";

export interface Place {
  name: string;
  /** Skyscanner place code, as in search URLs: `BOM` (airport), `IBOM` / `NYCA` (city, all airports). */
  code: string;
  /** IATA code: `BOM` for the airport and for Mumbai (all airports); `null` for countries. */
  iata: string | null;
  type: PlaceType;
  entityId: string;
  city: string;
  country: string;
}

/** The fields we read from one raw suggestion. */
export interface RawPlace {
  PlaceId?: string;
  PlaceName?: string;
  IataCode?: string;
  CityId?: string;
  CityName?: string;
  CountryId?: string;
  CountryName?: string;
  GeoId?: string;
}

export interface AutosuggestResult {
  /** HTTP status; 0 when the request failed (see `failure`). */
  status: number;
  failure?: "timeout" | "network" | "malformed";
  places: RawPlace[];
}

/** Runs INSIDE the page (see page-scripts.ts): must not use anything from outside the function. */
export async function autosuggestInPage(args: {
  market: string;
  locale: string;
  text: string;
  isDestination: boolean;
  timeoutMs: number;
}): Promise<AutosuggestResult> {
  const url =
    `/g/autosuggest-search/api/v1/search-flight/${args.market}/${args.locale}/${encodeURIComponent(args.text)}` +
    `?enable_general_search_v2=true&isDestination=${args.isDestination}`;
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: "include",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(args.timeoutMs),
    });
  } catch (error) {
    return { status: 0, failure: (error as Error).name === "TimeoutError" ? "timeout" : "network", places: [] };
  }
  if (!response.ok) return { status: response.status, places: [] };
  try {
    const json = (await response.json()) as RawPlace[];
    const places = Array.isArray(json)
      ? json.slice(0, 10).map(({ PlaceId, PlaceName, IataCode, CityId, CityName, CountryId, CountryName, GeoId }) => ({
          PlaceId, PlaceName, IataCode, CityId, CityName, CountryId, CountryName, GeoId,
        }))
      : [];
    return { status: response.status, places };
  } catch {
    return { status: response.status, failure: "malformed", places: [] };
  }
}

export function normalizePlaces(raw: RawPlace[]): Place[] {
  return raw.flatMap((place): Place[] => {
    if (!place.PlaceId || !place.GeoId) return [];
    const type: PlaceType =
      place.PlaceId === place.CountryId ? "country" : place.PlaceId === place.CityId ? "city" : "airport";
    return [
      {
        name: place.PlaceName ?? place.PlaceId,
        code: place.PlaceId,
        iata: place.IataCode || (type === "airport" ? place.PlaceId : null),
        type,
        entityId: place.GeoId,
        city: place.CityName ?? "",
        country: place.CountryName ?? "",
      },
    ];
  });
}

/** The suggestion with exactly this code: place code first (`BOM`, `NYCA`), then IATA (`NYC` → New York). */
export function pickPlace(places: Place[], code: string): Place | undefined {
  const wanted = code.trim().toUpperCase();
  return places.find((place) => place.code.toUpperCase() === wanted) ?? places.find((place) => place.iata === wanted);
}
