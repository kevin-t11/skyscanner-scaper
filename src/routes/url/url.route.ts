/** `GET|POST /url`: authenticate, validate, run the search, log each step, save the response, map errors to `failed.code`. */
import {
  InvalidSearchUrlError,
  NoSessionAvailableError,
  SessionBlockedError,
  UpstreamError,
} from "../../errors";
import { createLogger, formatDuration, type Logger } from "../../logging/logger";
import { saveSearchOutput } from "../../output/search-output-writer";
import type { FlightSearch, FlightSearchRequest } from "../../search/flight-search-service";
import { failEnvelope, passEnvelope, type FailureCode, type SearchEnvelope } from "./url-response";
import { InvalidRequestError, parseSearchRequest, type RawSearchInput } from "./url-request";

const HTTP_STATUS: Record<FailureCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  no_session: 503,
  blocked: 502,
  upstream_error: 502,
  internal_error: 500,
};

function failureCodeFor(error: unknown): FailureCode {
  if (error instanceof InvalidRequestError || error instanceof InvalidSearchUrlError) return "invalid_request";
  if (error instanceof NoSessionAvailableError) return "no_session";
  if (error instanceof SessionBlockedError) return "blocked";
  if (error instanceof UpstreamError) return "upstream_error";
  return "internal_error";
}

const newRequestId = () => crypto.randomUUID().slice(0, 6);

const envelopeResponse = (envelope: SearchEnvelope, requestId: string, code?: FailureCode) =>
  Response.json(envelope, { status: code ? HTTP_STATUS[code] : 200, headers: { "x-request-id": requestId } });

/** Formats an unvalidated input value for a log line; never throws, whatever the caller sent. */
const formatInputValue = (value: unknown, fallback: string): string => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return `<${Array.isArray(value) ? "array" : typeof value}>`;
};

const describeInput = (input: RawSearchInput) =>
  `sort=${formatInputValue(input.sort, "best")} max=${formatInputValue(input.max, "50")}` +
  `${input.fast ? ` fast=${formatInputValue(input.fast, "")}` : ""} url=${formatInputValue(input.url, "-")}`;

function logOutcome(log: Logger, envelope: SearchEnvelope): void {
  if (envelope.status === "pass" && envelope.result) {
    const { count, total, complete, itineraries } = envelope.result;
    const top = itineraries[0];
    const topLabel = top ? ` · top ${top.priceFormatted || top.price}, ${top.durationMinutes} min` : "";
    log.info(`pass · ${count}/${total} flights${complete ? "" : " (partial)"}${topLabel} · ${formatDuration(envelope.timeElapsedMs)}`);
  } else {
    const failure = envelope.failed as { code?: string; message?: string };
    log.warn(`fail · ${failure.code}: ${failure.message} · ${formatDuration(envelope.timeElapsedMs)}`);
  }
}

export interface UrlRouteOptions {
  /** When set, `/url` requires `x-api-key: <apiKey>`. */
  apiKey?: string;
  /** When set, every search response is also saved there as a JSON file. */
  outputDir?: string;
}

export function createUrlRoute(search: FlightSearch, { apiKey, outputDir }: UrlRouteOptions = {}) {
  const isAuthorized = (req: Request) => !apiKey || req.headers.get("x-api-key") === apiKey;

  async function finish(envelope: SearchEnvelope, requestId: string, log: Logger, code?: FailureCode): Promise<Response> {
    logOutcome(log, envelope);
    if (outputDir) {
      try {
        log.info(`saved ${await saveSearchOutput(outputDir, envelope, requestId)}`);
      } catch (error) {
        log.warn(`could not save output: ${(error as Error).message}`);
      }
    }
    return envelopeResponse(envelope, requestId, code);
  }

  async function handleSearch(method: string, input: RawSearchInput): Promise<Response> {
    const requestId = newRequestId();
    const log = createLogger(`req ${requestId}`, { timed: true });
    log.info(`${method} /url ${describeInput(input)}`);
    let request: FlightSearchRequest | undefined;
    try {
      request = parseSearchRequest(input);
      const result = await search.search(request, log);
      return await finish(passEnvelope(request, result, log.elapsedMs()), requestId, log);
    } catch (error) {
      const code = failureCodeFor(error);
      if (code === "internal_error") log.error(`unexpected error: ${(error as Error).stack ?? error}`);
      const message = code === "internal_error" ? "internal error" : (error as Error).message;
      const envelope = failEnvelope({ code, message }, log.elapsedMs(), request ? { request } : { input });
      return await finish(envelope, requestId, log, code);
    }
  }

  /** Rejected before a search starts: logged, not saved. */
  function rejectInput(input: RawSearchInput, code: FailureCode, message: string): Response {
    const requestId = newRequestId();
    createLogger(`req ${requestId}`).warn(`rejected · ${code}: ${message}`);
    return envelopeResponse(failEnvelope({ code, message }, 0, { input }), requestId, code);
  }

  return {
    GET(req: Request): Promise<Response> | Response {
      const input = Object.fromEntries(new URL(req.url).searchParams);
      if (!isAuthorized(req)) return rejectInput(input, "unauthorized", "missing or invalid x-api-key");
      return handleSearch("GET", input);
    },
    async POST(req: Request): Promise<Response> {
      // Check the key before reading the body, so unauthenticated callers cannot make us parse it.
      if (!isAuthorized(req)) return rejectInput({}, "unauthorized", "missing or invalid x-api-key");
      const body: unknown = await req.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return rejectInput({}, "invalid_request", "body must be a JSON object");
      }
      return handleSearch("POST", body as RawSearchInput);
    },
  };
}
