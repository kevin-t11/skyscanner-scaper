/**
 * `POST /search`: a flight search from explicit fields instead of a Skyscanner URL.
 *   { "from": "BOM", "to": "NYCA", "departDate": "2026-12-15", "returnDate": "2026-12-22",
 *     "cabinClass": "economy", "adults": 1, "childAges": [0, 7], "max": 50, "sort": "best" }
 * `childAges` has one age (0-17) per child; under 2 is an infant on an adult's lap.
 * `from` / `to` are Skyscanner place codes (airport `BOM`, city `NYCA`); find them with `GET /places`.
 * Same response envelope as `/url`; `request.searchUrl` is the same search on the website.
 */
import { SKYSCANNER_SITE } from "../config/app-config";
import { buildSearchPath, type CabinClass } from "../parsers/search-url";
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
const MAX_CHILDREN = 8;
const MAX_CHILD_AGE = 17;
/** Skyscanner prices a child under 2 as an infant, travelling on an adult's lap. */
const INFANT_AGE_LIMIT = 2;
const PLACE_CODE = /^[A-Za-z]{3,4}$/;
const DAY_MS = 86_400_000;

function placeField(input: RawSearchInput, field: "from" | "to"): string {
  const value = typeof input[field] === "string" ? (input[field] as string).trim() : "";
  if (!PLACE_CODE.test(value)) {
    throw new InvalidRequestError(`\`${field}\` must be a Skyscanner place code (3-4 letters, e.g. BOM, NYCA); find codes with GET /places?q=`);
  }
  return value.toUpperCase();
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

function childAgesField(input: RawSearchInput, adults: number): number[] {
  const value = input.childAges;
  if (value === undefined || value === null || value === "") return [];
  const ages = Array.isArray(value) ? value : null;
  if (!ages || ages.length > MAX_CHILDREN || !ages.every((age) => Number.isInteger(age) && age >= 0 && age <= MAX_CHILD_AGE)) {
    throw new InvalidRequestError(`\`childAges\` must be a list of up to ${MAX_CHILDREN} ages, each an integer 0..${MAX_CHILD_AGE}`);
  }
  if (ages.filter((age) => age < INFANT_AGE_LIMIT).length > adults) {
    throw new InvalidRequestError(`each infant (age under ${INFANT_AGE_LIMIT}) needs an adult`);
  }
  return ages as number[];
}

function parseFieldsRequest(input: RawSearchInput): ParsedSearchRequest {
  const from = placeField(input, "from");
  const to = placeField(input, "to");

  const departDate = dateField(input, "departDate");
  const returnDate = input.returnDate === undefined || input.returnDate === null || input.returnDate === "" ? null : dateField(input, "returnDate");
  if (returnDate && returnDate < departDate) throw new InvalidRequestError("`returnDate` must be on or after `departDate`");

  const cabinName = input.cabinClass === undefined || input.cabinClass === "" ? "economy" : input.cabinClass;
  const cabinClass = typeof cabinName === "string" ? CABIN_CLASSES[cabinName.toLowerCase()] : undefined;
  if (!cabinClass) throw new InvalidRequestError(`\`cabinClass\` must be one of ${Object.keys(CABIN_CLASSES).join(", ")}`);

  const adults = input.adults === undefined || input.adults === "" ? 1 : Number(input.adults);
  if (!Number.isInteger(adults) || adults < 1 || adults > MAX_ADULTS) throw new InvalidRequestError(`\`adults\` must be an integer 1..${MAX_ADULTS}`);

  const childAges = childAgesField(input, adults);

  if (from === to) throw new InvalidRequestError("`from` and `to` must differ");

  const options = parseListOptions(input);
  const query = { from, to, dates: returnDate ? [departDate, returnDate] : [departDate], adults, childAges, cabinClass };
  const pathAndQuery = buildSearchPath(query, { from: null, to: null });
  return {
    request: { query, pathAndQuery, ...options },
    summary: { searchUrl: `https://${SKYSCANNER_SITE.host}${pathAndQuery}`, from, to, departDate, returnDate, cabinClass: cabinName as string, adults, childAges, maxItems: options.maxItems, sorting: options.sort },
  };
}

const describeFieldsInput = (input: RawSearchInput): SearchRequestSummary => ({
  from: textOrNull(input.from),
  to: textOrNull(input.to),
  departDate: textOrNull(input.departDate),
  returnDate: textOrNull(input.returnDate),
  cabinClass: textOrNull(input.cabinClass) ?? "economy",
  adults: typeof input.adults === "number" ? input.adults : input.adults === undefined ? 1 : null,
  childAges: Array.isArray(input.childAges) ? input.childAges : null,
  ...describeListOptions(input),
});

export const createSearchRoute = (context: RouteContext) =>
  createFlightSearchRoute(context, {
    path: "/search",
    logFields: ["from", "to", "departDate", "returnDate", "cabinClass", "adults", "childAges", "sort", "max"],
    parse: parseFieldsRequest,
    describe: describeFieldsInput,
  });
