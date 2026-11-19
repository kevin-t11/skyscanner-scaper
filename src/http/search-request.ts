/** Validates `/url` input (query string or JSON body) into a `FlightSearchRequest`. */
import type { FlightSearchRequest } from "../search/flight-search-service";
import { SORT_ORDERS, type SortOrder } from "../skyscanner/itinerary";
import { parseSearchUrl } from "../skyscanner/search-url";

export const DEFAULT_MAX_ITEMS = 50;
export const MAX_ITEMS_LIMIT = 1_000;
export const DEFAULT_SORT: SortOrder = "best";

export class InvalidRequestError extends Error {}

export type RawSearchInput = Record<string, unknown>;

const isBlank = (value: unknown) => value === undefined || value === null || value === "";
const isTrue = (value: unknown) => value === true || value === "true" || value === "1";

export function parseSearchRequest(input: RawSearchInput): FlightSearchRequest {
  const searchUrl = input.url;
  if (typeof searchUrl !== "string" || !searchUrl) throw new InvalidRequestError("`url` is required");
  parseSearchUrl(searchUrl); // fail fast, before a browser session is taken

  const maxItems = isBlank(input.max) ? DEFAULT_MAX_ITEMS : typeof input.max === "number" || typeof input.max === "string" ? Number(input.max) : NaN;
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > MAX_ITEMS_LIMIT) {
    throw new InvalidRequestError(`\`max\` must be an integer 1..${MAX_ITEMS_LIMIT}`);
  }

  const sort = isBlank(input.sort) ? DEFAULT_SORT : input.sort;
  if (!SORT_ORDERS.includes(sort as SortOrder)) {
    throw new InvalidRequestError(`\`sort\` must be one of ${SORT_ORDERS.join(", ")}`);
  }

  return { searchUrl, maxItems, sort: sort as SortOrder, fast: isTrue(input.fast) };
}

/**
 * Best-effort echo of the caller's options for a failure envelope when the
 * input itself was invalid. Never throws; applies the same defaults.
 */
export function describeRawInput(input: RawSearchInput): Pick<FlightSearchRequest, "fast"> & {
  searchUrl: string | null;
  maxItems: number | null;
  sort: string | null;
} {
  const max = isBlank(input.max) ? DEFAULT_MAX_ITEMS : typeof input.max === "number" ? input.max : typeof input.max === "string" ? Number(input.max) : NaN;
  return {
    searchUrl: typeof input.url === "string" ? input.url : null,
    maxItems: Number.isFinite(max) ? max : null,
    sort: isBlank(input.sort) ? DEFAULT_SORT : typeof input.sort === "string" ? input.sort : null,
    fast: isTrue(input.fast),
  };
}
