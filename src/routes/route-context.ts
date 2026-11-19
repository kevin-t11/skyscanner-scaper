/** What every route handler can use; built once in `server.ts`. */
import type { FlightSearch } from "../services/flight-search.service";
import type { PoolHealth } from "../sessions/session-pool";

export interface RouteContext {
  search: FlightSearch;
  poolHealth: () => Pick<PoolHealth, "live"> & Partial<PoolHealth>;
  /** When set, protected routes require `x-api-key: <apiKey>`. */
  apiKey?: string;
  /** When set, every `/url` and `/search` response is also saved there as a JSON file. */
  outputDir?: string;
}
