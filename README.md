# Skyscanner flight scraper

An HTTP service that takes a Skyscanner flight search URL and returns its itineraries as sorted JSON.

```bash
curl -G localhost:8000/url \
  --data-urlencode 'url=https://www.skyscanner.co.in/transport/flights/blr/del/261223/?adultsv2=1&cabinclass=economy' \
  -d max=10 -d sort=cheapest
```

It calls Skyscanner's own search API (`web-unified-search`), not the HTML. The calls are made with `fetch()` inside
warmed, headful Chrome sessions, because PerimeterX blocks that API for plain HTTP clients and headless browsers.
Findings, the request format and measurements are in [docs/DESIGN.md](docs/DESIGN.md).

- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [API](#api)
- [Logs](#logs)
- [Output files](#output-files)
- [Proxies](#proxies)
- [Troubleshooting](#troubleshooting)
- [Project structure](#project-structure)
- [Development](#development)

## Requirements

| What | Notes |
|---|---|
| [Bun](https://bun.sh) 1.3+ | `curl -fsSL https://bun.sh/install \| bash` |
| Google Chrome or Chromium | Any recent stable version |
| A display for Chrome | A desktop (macOS, Windows, Linux desktop), or `xvfb-run` on a server (`apt install xvfb`) |
| A residential proxy | Optional on a home connection; needed on servers, whose datacenter IPs are blocked after a few searches |

## Quick start

### macOS (local testing)
```bash
git clone https://github.com/kevin-t11/skyscanner-scaper.git
cd skyscanner-scaper
bun install
cp .env.example .env
```

Edit `.env`. For India with no proxy, on your home connection:
```bash
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SKYSCANNER_HOST=www.skyscanner.co.in
MARKET=IN
LOCALE=en-GB
CURRENCY=INR
POOL_SIZE=1
PROXY_URL=
```

Then:
```bash
bun start
```

A Chrome window opens: that is the browser session, so leave it open. When the log says
`first browser session ready, accepting searches`, run a search:

```bash
curl -s -G localhost:8000/url \
  --data-urlencode 'url=https://www.skyscanner.co.in/transport/flights/bom/goi/261219/?adultsv2=1&cabinclass=economy' \
  -d max=10 -d sort=cheapest | jq '.status, .result.count, .result.itineraries[0].priceFormatted'
```

### Linux server
```bash
sudo apt install -y xvfb google-chrome-stable   # or chromium
bun install
cp .env.example .env                             # set PROXY_URL, SKYSCANNER_HOST, MARKET/LOCALE/CURRENCY
xvfb-run -a bun start
```

To run it as a service, put `xvfb-run -a bun src/main.ts` in a systemd unit or a process manager (pm2, supervisord).
Stop it with Ctrl-C or `SIGTERM`; browsers are closed cleanly.

## Configuration
Set these in `.env` (Bun loads it automatically) or in the environment.

| Variable | Default | Meaning |
|---|---|---|
| `PROXY_URL` | none | `http://user:pass@host:port`; `{session}` is replaced per browser so each one keeps a sticky IP |
| `POOL_SIZE` | `2` | Browser sessions (one IP each, ~300–700 MB RAM each) |
| `SKYSCANNER_HOST` | `www.skyscanner.com` | Site the sessions use; results use its market |
| `MARKET` / `LOCALE` / `CURRENCY` | `US` / `en-US` / `USD` | Must match the host, e.g. `IN` / `en-GB` / `INR` for `.co.in` |
| `SEARCH_DEADLINE_MS` | `12000` | Maximum time to wait for Skyscanner to finish; partial results are returned after that |
| `CHROME_PATH` | `google-chrome` | Chrome binary |
| `HEADLESS` | `false` | Headless Chrome is blocked by the search API; use only for debugging |
| `PORT` | `8000` | HTTP port |
| `HOST` | `127.0.0.1` | Listen address; use `0.0.0.0` only together with `API_KEY` |
| `API_KEY` | none | When set, `/url` requires the `x-api-key` header |
| `OUTPUT_DIR` | `output` | Where every search response is saved as JSON; set it empty (`OUTPUT_DIR=`) to turn saving off |
| `LOGGING` | `enabled` | `enabled` prints the server logs; `disabled` turns them all off |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error` (when `LOGGING` is enabled) |

## API

### `GET /url` or `POST /url`
| Parameter | Default | Meaning |
|---|---|---|
| `url` | required | Skyscanner flight search URL (`/transport/flights/{from}/{to}/{yymmdd}/[{yymmdd}/]`) |
| `max` | `50` | Itineraries to return (1–1000) |
| `sort` | `best` | `best` (Skyscanner's score), `cheapest`, or `fastest` |
| `fast` | `false` | Return as soon as `max` itineraries are known instead of waiting for the complete list |

Options read from the search URL: `adultsv2`, `childrenv2` (child ages, e.g. `4|9`), `cabinclass`
(`economy`, `premiumeconomy`, `business`, `first`). Add a second date for a return trip.

```bash
# GET
curl -G localhost:8000/url --data-urlencode 'url=<search url>' -d max=20 -d sort=fastest -d fast=true
# POST
curl localhost:8000/url -H 'content-type: application/json' \
  -d '{"url":"<search url>","max":20,"sort":"best"}'
# with API_KEY set
curl -G localhost:8000/url -H 'x-api-key: <key>' --data-urlencode 'url=<search url>'
```

Every response, pass or fail, has the same shape. Each one carries an `x-request-id` header that matches its log
lines and output file.

```jsonc
// abridged response from a live run
{
  "status": "pass",                  // "fail" on any error
  "timeElapsedMs": 8110,
  "request": {                       // options the search ran with, defaults applied
    "searchUrl": "https://www.skyscanner.co.in/transport/flights/blr/del/261223/?adultsv2=1&cabinclass=economy",
    "maxItems": 10,
    "sorting": "cheapest",
    "fast": false
  },
  "result": {                        // null on fail
    "complete": true,                // false when stopped by `fast` or the deadline
    "total": 270,                    // priced itineraries Skyscanner returned
    "count": 10,                     // itineraries in this response
    "query": { "from": "blr", "to": "del", "dates": ["2026-12-23"], "adults": 1, "childAges": [], "cabinClass": "ECONOMY" },
    "timings": { "routeLookupMs": 412, "searchMs": 7540, "firstResultsMs": 1110, "totalMs": 8110, "upstreamRequests": 5 },
    "itineraries": [{
      "id": "…", "price": 9537, "priceFormatted": "₹9,537", "score": …, "tags": […],
      "durationMinutes": 360, "stops": …, "isSelfTransfer": false, "emissionsKg": …,
      "legs": [{
        "origin": { "code": "BLR", "name": "…", "entityId": "95673351" },
        "destination": { "code": "DEL", "name": "…", "entityId": "95673498" },
        "departure": "…", "arrival": "…", "durationMinutes": 360, "stops": …,
        "carriers": [{ "code": "…", "name": "…", "logoUrl": "…" }],
        "segments": [{ "flightNumber": "…", "origin": "BLR", "destination": "…", "departure": "…", "arrival": "…", "durationMinutes": … }]
      }],
      "bookingOptions": [{ "agentId": "…", "agentName": "…", "price": 9537, "url": "https://www.skyscanner.co.in/transport_deeplink/…" }]
    }]
  },
  "failed": {}                       // on fail: { "code": "blocked", "message": "search API returned 403" }
}
```

| HTTP | `failed.code` | Meaning |
|---|---|---|
| 400 | `invalid_request` | Invalid parameters or not a flight search URL |
| 401 | `unauthorized` | `API_KEY` is set and `x-api-key` is missing or wrong |
| 502 | `blocked` | PerimeterX blocked the session twice (sessions are replaced automatically) |
| 502 | `upstream_error` | Skyscanner failed: network error, bad response, unknown airport, or no results before the deadline |
| 503 | `no_session` | No browser session became ready within 30 s |
| 500 | `internal_error` | Unexpected error (details in the server log) |

### `GET /health`
Pool state: ready and warming sessions, launches, retirements, and requests made by each session.

## Logs
The server prints one compact line per step to stdout (warnings and errors go to stderr):

```
time         level  [scope   elapsed]  message
```

Search lines are tagged with the request id and the time since the request arrived. From a live run:

```
17:25:54.791 INFO  [server] listening on http://127.0.0.1:8000 · www.skyscanner.co.in (IN/INR) · pool 1 · output output
17:25:54.795 INFO  [pool] session 58dad6aa0d23 launching without proxy
17:26:01.432 INFO  [pool] session 58dad6aa0d23 ready in 6.64s (1/1 ready)
17:26:06.775 INFO  [req 892d46 +0.00s] GET /url sort=cheapest max=10 url=https://www.skyscanner.co.in/transport/flights/blr/del/261223/?adultsv2=1&cabinclass=economy
17:26:06.778 INFO  [req 892d46 +0.00s] session 58dad6aa0d23 acquired
17:26:07.190 INFO  [req 892d46 +0.41s] url fetched · route blr=95673351 → del=95673498 in 412ms
17:26:08.306 INFO  [req 892d46 +1.53s] search created · found 10 flights · incomplete
17:26:10.020 INFO  [req 892d46 +3.25s] poll 2 · found 270 flights (+260) · incomplete
17:26:10.925 INFO  [req 892d46 +4.15s] poll 3 · found 270 flights (+0) · incomplete
17:26:14.727 INFO  [req 892d46 +7.95s] poll 5 · found 270 flights (+0) · complete
17:26:14.880 INFO  [req 892d46 +8.11s] complete · 270 flights in 5 requests · search 7.54s, first results 1.11s
17:26:14.881 INFO  [req 892d46 +8.11s] pass · 10/270 flights · top ₹9,537, 360 min · 8.11s
17:26:14.883 INFO  [req 892d46 +8.11s] saved output/20261119-172614_blr-del_cheapest_pass_892d46.json
```

| Line | Meaning |
|---|---|
| `url fetched · route …` | The search page was fetched once to look up the airports' Skyscanner ids (later searches on the route say `cached`) |
| `search created` / `poll N` | One API request each; `found` counts distinct flights so far, `(+N)` the new ones, then Skyscanner's status |
| `complete` / `deadline reached` / `fast mode` | Why the search stopped |
| `pass` / `fail` | What the response contained |
| `[pool] session … retired` | A session was blocked or broke and is being replaced with a new IP |

To keep logs in a file: `bun start 2>&1 | tee -a logs/server.log`. To turn logs off: `LOGGING=disabled`.
Output files are still saved when logging is off; they are controlled by `OUTPUT_DIR`.

## Output files
Every `/url` search response is saved to `OUTPUT_DIR` (default `output/`, which git ignores), named
`{date-time}_{from}-{to}_{sort}_{pass|fail}_{request id}.json`, for example
`output/20261119-172614_blr-del_cheapest_pass_892d46.json`. The file contains exactly the JSON response.
Requests rejected before a search starts (wrong API key, a body that isn't JSON) are logged but not saved.

## Proxies
Each browser session uses one sticky IP for its whole life, so put `{session}` in the proxy's session parameter:
```bash
# Evomi Core Residential: country targeting and a 30-minute sticky session
PROXY_URL=http://USERNAME:PASSWORD_country-IN_session-{session}_lifetime-30@rp.evomi.com:1000
```

- Chrome connects through the proxy and answers its login itself.
- Images, fonts and media are blocked.
- Skyscanner's static CDN (`*.skyscnr.com`) bypasses the proxy.
- A complete search uses about 0.5–4 MB of proxy traffic; `fast=true` uses far less.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `no_session` right after start | Wait for `first browser session ready`; the first session takes about 5–7 s |
| `[pool] session … failed to start: … ENOENT` | Set `CHROME_PATH` to your Chrome binary |
| `blocked` on every search | The IP is flagged: use a residential proxy, keep `HEADLESS=false`, and on a server run under `xvfb-run` |
| `upstream_error: could not resolve places` | The URL's airport or city codes are wrong, or the site has no page for that route |
| `upstream_error: … no results within 12000 ms` | Skyscanner was slow: raise `SEARCH_DEADLINE_MS` or use `fast=true` |
| Searches slow on large routes | Use `fast=true` and a smaller `max`; first results arrive in about 1–3 s |
| Port already in use | Change `PORT`, or stop the old server (`pkill -f "bun src/main.ts"`) |

## Project structure
```
routes/url → parseSearchRequest → FlightSearchService.search
         → SessionPool.acquire (least-busy warmed Chrome) → resolveRoute (airport ids, cached)
         → runUnifiedSearch (create + poll, one in-page fetch per step, logged) → rankItineraries
         → SearchEnvelope → saved to OUTPUT_DIR
```

```
src/
├── main.ts                          entry point: config → logger → pool → HTTP server
├── server.ts                        HTTP bootstrap only: Bun.serve + routes
├── errors.ts                        domain errors, mapped to failed.code
├── config/app-config.ts             AppConfig, loadAppConfig (env)
├── logging/logger.ts                createLogger: compact, timed, leveled log lines
├── output/search-output-writer.ts   saveSearchOutput: one JSON file per search
├── routes/                          every endpoint lives here, one file or folder per route
│   ├── index.ts                     createRoutes: the route table (add /details here later)
│   ├── route-context.ts             RouteContext: search service, pool health, API key, output dir
│   ├── health.route.ts              GET /health
│   └── url/
│       ├── url.route.ts             GET|POST /url: API key, request id, logging, saving, error → envelope
│       ├── url-request.ts           parseSearchRequest: validates url / max / sort / fast
│       └── url-response.ts          SearchEnvelope, passEnvelope, failEnvelope
├── search/flight-search-service.ts  FlightSearchService: the /url use case, route cache, retry on a fresh session
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
    ├── unified-search-runner.ts     runUnifiedSearch: create/poll loop, deadline, progress callbacks
    ├── page-scripts.ts              functions that run inside the page (route lookup, one search step)
    ├── itinerary.ts                 public Itinerary / FlightLeg / BookingOption types
    └── itinerary-normalizer.ts      normalizeItinerary, rankItineraries (best / cheapest / fastest)
```

## Development
```bash
bun test            # unit tests (live-response fixture, no network)
bun run typecheck   # tsc --noEmit
bun run dev         # restart on file changes
```

When Skyscanner changes its API, re-derive the request with
[agent-browser](https://github.com/vercel-labs/agent-browser) (`agent-browser skills get derive-client`). Record a
HAR of a real search and compare it with `buildUnifiedSearchBody` / `buildUnifiedSearchHeaders` in
`src/skyscanner/unified-search-api.ts`.
