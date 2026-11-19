# Skyscanner flight scraper

HTTP service that turns a Skyscanner search URL into sorted flight itineraries:

```bash
curl -G localhost:8080/url \
  --data-urlencode 'url=https://www.skyscanner.co.in/transport/flights/san/sfo/261210/261220/?adultsv2=1&cabinclass=economy' \
  -d max=20 -d sort=cheapest
```

It reads Skyscanner's own search API (`web-unified-search`), not the HTML. Requests run with `fetch()` inside
warmed, headful Chrome sessions, because PerimeterX rejects that API from plain HTTP clients and headless browsers.
The findings, request contract and measurements are in [docs/DESIGN.md](docs/DESIGN.md).

## Requirements
- [Bun](https://bun.sh) 1.3+
- Google Chrome or Chromium
- A display for Chrome: a desktop, or `xvfb-run` on servers (`apt install xvfb`)
- A residential proxy (Evomi Core Residential recommended); datacenter IPs are blocked after a few searches

## Run
```bash
bun install
cp .env.example .env          # set PROXY_URL, host and culture
xvfb-run -a bun start         # or `bun start` on a machine with a display
```

| Variable | Default | Meaning |
|---|---|---|
| `PROXY_URL` | none | `http://user:pass@host:port`; `{session}` is replaced per browser so each one keeps a sticky IP |
| `POOL_SIZE` | `2` | Browser sessions (one IP each, ~300–700 MB RAM each) |
| `SKYSCANNER_HOST` | `www.skyscanner.com` | Site the sessions use; results use its market |
| `MARKET` / `LOCALE` / `CURRENCY` | `US` / `en-US` / `USD` | Must match the host, e.g. `IN` / `en-GB` / `INR` for `.co.in` |
| `SEARCH_DEADLINE_MS` | `12000` | Upper bound for waiting on `complete` |
| `CHROME_PATH` | `google-chrome` | Chrome binary |
| `HEADLESS` | `false` | Headless Chrome is rejected by the search API; only for debugging |
| `PORT` | `8080` | HTTP port |
| `HOST` | `127.0.0.1` | Listen address; use `0.0.0.0` only together with `API_KEY` |
| `API_KEY` | none | When set, `/url` requires the `x-api-key` header |

## API

### `GET /url` or `POST /url`
| Parameter | Default | Meaning |
|---|---|---|
| `url` | required | Skyscanner flight search URL (`/transport/flights/{from}/{to}/{yymmdd}/[{yymmdd}/]`) |
| `max` | `50` | Itineraries to return (1–1000) |
| `sort` | `best` | `best` (Skyscanner score), `cheapest`, or `fastest` |
| `fast` | `false` | Return as soon as `max` itineraries are known instead of waiting for `complete` |

Query parameters read from the URL: `adultsv2`, `childrenv2` (`4\|9`), `cabinclass`
(`economy`, `premiumeconomy`, `business`, `first`).

Every response, success or failure, has the same shape:

```jsonc
// abridged response from a live run
{
  "searchUrl": "https://www.skyscanner.co.in/transport/flights/del/blr/261218/?adultsv2=1&cabinclass=economy",
  "maxItems": 20,
  "sorting": "best",
  "fast": false,
  "status": "pass",                // "fail" on any error
  "timeElapsedMs": 7235,
  "complete": true,                // false when stopped by `fast` or the deadline
  "total": 284,                    // itineraries Skyscanner returned
  "count": 20,
  "query": { "from": "del", "to": "blr", "dates": ["2026-12-18"], "adults": 1, "childAges": [], "cabin": "ECONOMY" },
  "timings": { "resolveMs": 449, "searchMs": 6548, "firstResultsMs": 1319, "totalMs": 7235, "requests": 4 },
  "results": [{
    "id": "…", "price": 8856, "priceFormatted": "₹8,856", "score": 0.999, "tags": [ … ],
    "durationMinutes": 175, "stops": 0, "isSelfTransfer": false, "emissionsKg": null,
    "legs": [{ "origin": { "code": "DEL", … }, "destination": { "code": "BLR", … }, "departure": "…", "arrival": "…",
               "durationMinutes": 175, "stops": 0, "carriers": [{ "code": "SG", "name": "SpiceJet", … }], "segments": [ … ] }],
    "bookingOptions": [{ "agentId": "…", "agentName": "…", "price": 8856, "url": "https://www.skyscanner.co.in/transport_deeplink/…" }]
  }],
  "failed": {}                     // on fail: { "code": "blocked", "message": "search API returned 403" }
}
```

| HTTP | `failed.code` | Meaning |
|---|---|---|
| 400 | `invalid_request` | Invalid parameters or not a flight search URL |
| 401 | `unauthorized` | `API_KEY` is set and `x-api-key` is missing or wrong |
| 502 | `blocked` / `upstream_error` | Blocked by PerimeterX twice (sessions are replaced automatically), no results before the deadline, or another upstream error |
| 503 | `no_session` | No browser session ready yet |
| 500 | `internal_error` | Unexpected error (logged) |

### `GET /health`
Pool state: ready sessions, launches, retirements, and per-session request counts.

## How it works
```
/url → parseSearchRequest → FlightSearchService.search
         → resolveRoute (entity ids, cached)  → SessionPool.acquire (least-busy warmed Chrome)
         → runUnifiedSearchInPage (create + poll inside the page) → rankItineraries → SearchEnvelope
```

```
src/
├── main.ts                          entry point: config → pool → HTTP server
├── errors.ts                        domain errors, mapped to failed.code
├── config/app-config.ts             AppConfig, loadAppConfig (env)
├── http/
│   ├── http-server.ts               routes, API key check, error → envelope mapping
│   ├── search-request.ts            parseSearchRequest: validates url / max / sort / fast
│   └── search-envelope.ts           SearchEnvelope, passEnvelope, failEnvelope
├── search/flight-search-service.ts  FlightSearchService: the /url use case, route cache, retry on block
├── sessions/
│   ├── session-pool.ts              SessionPool: warm-up, least-busy acquire, retire + replace, shutdown
│   └── browser-session.ts           BrowserSession: one Chrome + one proxy IP, in-flight tracking
├── browser/
│   ├── chrome-browser.ts            ChromeBrowser: launch, navigate, evaluate, resource blocking, proxy auth
│   ├── cdp-connection.ts            CdpConnection: typed CDP client over one WebSocket
│   ├── cdp-protocol.ts              typed CDP commands and events used here
│   └── proxy-settings.ts            parseProxyUrl, proxyForSession ({session} placeholder)
└── skyscanner/
    ├── search-url.ts                parseSearchUrl: /transport/flights/... → FlightSearchQuery
    ├── unified-search-api.ts        API endpoint, request builders, typed API responses (Api*)
    ├── page-scripts.ts              lookupRouteEntitiesInPage, runUnifiedSearchInPage (run in the page)
    ├── itinerary.ts                 public Itinerary / FlightLeg / BookingOption types
    └── itinerary-normalizer.ts      normalizeItinerary, rankItineraries (best / cheapest / fastest)
```

## Development
```bash
bun test          # unit tests (live response fixture, no network)
bun run typecheck
```

When Skyscanner changes its API, re-derive the request with
[agent-browser](https://github.com/vercel-labs/agent-browser) (`agent-browser skills get derive-client`): record a
HAR of a real search and compare it with `buildSearchBody` / `buildHeaders` in `src/skyscanner.ts`.
