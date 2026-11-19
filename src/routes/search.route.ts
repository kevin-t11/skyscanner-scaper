/**
 * `POST /search`: a flight search from explicit fields instead of a Skyscanner URL.
 *   { "from": "Mumbai", "to": "BOM", "departDate": "2026-12-15", "returnDate": "2026-12-22",
 *     "cabinClass": "economy", "adults": 1, "max": 50, "sort": "best" }
 * `from` / `to` are city or airport names or codes, resolved with Skyscanner's autocomplete.
 * Same response envelope as `/url`.
 */
import type { CabinClass } from "../parsers/search-url";
import type { RouteContext } from "./route-context";
import {
  createFlightSearchRoute,
  describeListOptions,
  InvalidRequestError,
  parseListOptions,
  textOrNull,
  type ParsedSearchRequest,
  type RawSearchInput,
  type SearchRequestSummary,
} from "./url.route";

const CABIN_CLASSES: Record<string, CabinClass> = {
  economy: "ECONOMY",
  premium_economy: "PREMIUM_ECONOMY",
  business: "BUSINESS",
  first: "FIRST",
};
const MAX_ADULTS = 8;
const MAX_PLACE_LENGTH = 100;
const DAY_MS = 86_400_000;

function placeField(input: RawSearchInput, field: "from" | "to"): string {
  const value = input[field];
  if (typeof value !== "string" || !value.trim()) throw new InvalidRequestError(`\`${field}\` is required (city or airport name or code)`);
  if (value.length > MAX_PLACE_LENGTH) throw new InvalidRequestError(`\`${field}\` is longer than ${MAX_PLACE_LENGTH} characters`);
  return value.trim();
}

function dateField(input: RawSearchInput, field: "departDate" | "returnDate"): string {
  const value = input[field];
  // Date parsing rolls impossible dates over (2027-02-29 → 2027-03-01); require an exact round trip.
  const parsed = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new InvalidRequestError(`\`${field}\` must be a date YYYY-MM-DD`);
  }
  // A day of slack: "today" differs between the caller's time zone and the server's.
  if (Date.parse(`${value}T00:00:00Z`) < Date.now() - DAY_MS) throw new InvalidRequestError(`\`${field}\` is in the past`);
  return value as string;
}

function parseFieldsRequest(input: RawSearchInput): ParsedSearchRequest {
  const from = placeField(input, "from");
  const to = placeField(input, "to");
  if (from.toLowerCase() === to.toLowerCase()) throw new InvalidRequestError("`from` and `to` must differ");

  const departDate = dateField(input, "departDate");
  const returnDate = input.returnDate === undefined || input.returnDate === null || input.returnDate === "" ? null : dateField(input, "returnDate");
  if (returnDate && returnDate < departDate) throw new InvalidRequestError("`returnDate` must be on or after `departDate`");

  const cabinName = input.cabinClass === undefined || input.cabinClass === "" ? "economy" : input.cabinClass;
  const cabinClass = typeof cabinName === "string" ? CABIN_CLASSES[cabinName.toLowerCase()] : undefined;
  if (!cabinClass) throw new InvalidRequestError(`\`cabinClass\` must be one of ${Object.keys(CABIN_CLASSES).join(", ")}`);

  const adults = input.adults === undefined || input.adults === "" ? 1 : Number(input.adults);
  if (!Number.isInteger(adults) || adults < 1 || adults > MAX_ADULTS) throw new InvalidRequestError(`\`adults\` must be an integer 1..${MAX_ADULTS}`);

  const options = parseListOptions(input);
  return {
    request: { query: { from, to, dates: returnDate ? [departDate, returnDate] : [departDate], adults, childAges: [], cabinClass }, ...options },
    summary: { from, to, departDate, returnDate, cabinClass: cabinName as string, adults, maxItems: options.maxItems, sorting: options.sort },
  };
}

const describeFieldsInput = (input: RawSearchInput): SearchRequestSummary => ({
  from: textOrNull(input.from),
  to: textOrNull(input.to),
  departDate: textOrNull(input.departDate),
  returnDate: textOrNull(input.returnDate),
  cabinClass: textOrNull(input.cabinClass) ?? "economy",
  adults: typeof input.adults === "number" ? input.adults : input.adults === undefined ? 1 : null,
  ...describeListOptions(input),
});

export const createSearchRoute = (context: RouteContext) =>
  createFlightSearchRoute(context, {
    path: "/search",
    logFields: ["from", "to", "departDate", "returnDate", "cabinClass", "adults", "sort", "max"],
    parse: parseFieldsRequest,
    describe: describeFieldsInput,
  });
