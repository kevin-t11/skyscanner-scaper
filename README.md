# Skyscanner flight scraper

An HTTP service that takes a Skyscanner flight search URL and returns its itineraries as sorted JSON.

```bash
curl localhost:8000/url -H 'content-type: application/json' \
  -d '{"url":"https://www.skyscanner.co.in/transport/flights/blr/del/261223/?adultsv2=1&cabinclass=economy","max":10,"sort":"cheapest"}'
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
- [Folder and file guide](#folder-and-file-guide)

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

`.env` works as is on your own connection (no proxy). Chrome is found automatically.

Then:
```bash
bun start
```

A Chrome window opens: that is the browser session, so leave it open. When the log says
`first browser session ready, accepting searches`, run a search:

```bash
curl -s localhost:8000/url -H 'content-type: application/json' \
  -d '{"url":"https://www.skyscanner.co.in/transport/flights/bom/goi/261219/?adultsv2=1&cabinclass=economy","max":10,"sort":"cheapest"}' | jq '.status, .result.count, .result.itineraries[0].priceFormatted'
```

### Linux server
```bash
sudo apt install -y xvfb google-chrome-stable   # or chromium
bun install
cp .env.example .env                             # set PROXY_URL
xvfb-run -a bun start
```

To run it as a service, put `xvfb-run -a bun src/main.ts` in a systemd unit or a process manager (pm2, supervisord).
Stop it with Ctrl-C or `SIGTERM`; browsers are closed cleanly.

## Configuration
Only these, and only from the `.env` file in the project folder (shell or systemd variables are ignored):

| Variable | Default | Meaning |
|---|---|---|
| `PROXY_URL` | none | `http://user:pass@host:port` or `host:port:user:pass`; `{session}` is replaced per browser so each one keeps a sticky IP |
| `PORT` | `8000` | HTTP port; the server listens on `localhost` only |
| `POOL_SIZE` | `1` | Browser sessions (one IP and ~300–700 MB RAM each); raise it for parallel searches |
| `API_KEY` | none | When set, `/url` requires the `x-api-key` header |
| `LOGGING` | `enabled` | `enabled` prints the server logs; `disabled` turns them all off |
| `CHROME_PATH` | found automatically | Only needed if Chrome is installed somewhere unusual |

Fixed settings, changed in <code>src/config/app-config.ts</code> if ever needed:
- **Site:** `www.skyscanner.co.in`, market `IN`, locale `en-GB`, prices in `INR`.
- **Search deadline:** 12 s; partial results are returned after that.
- **Output folder:** `output/`.
- **Browser:** headful Chrome, because the search API blocks headless Chrome.

## API

### `POST /url`
Send a JSON body. `GET /url` returns 405.
| Field | Default | Meaning |
|---|---|---|
| `url` | required | Skyscanner flight search URL (`/transport/flights/{from}/{to}/{yymmdd}/[{yymmdd}/]`) |
| `max` | `50` | Itineraries to return (1–1000) |
| `sort` | `best` | `best` (Skyscanner's score), `cheapest`, or `fastest` |

Options read from the search URL: `adultsv2`, `childrenv2` (child ages, e.g. `4|9`), `cabinclass`
(`economy`, `premiumeconomy`, `business`, `first`). Add a second date for a return trip.

```bash
curl localhost:8000/url -H 'content-type: application/json' \
  -d '{"url":"<search url>","max":20,"sort":"fastest"}'
# with API_KEY set
curl localhost:8000/url -H 'content-type: application/json' -H 'x-api-key: <key>' -d '{"url":"<search url>"}'
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
    "sorting": "cheapest"
  },
  "result": {                        // null on fail
    "complete": true,                // false when the 12 s deadline was reached first
    "counts": {                      // how many itineraries...
      "received": 270,               // ...Skyscanner returned
      "passed": 270,                 // ...were parsed successfully, with a price
      "failed": 0,                   // ...were dropped (no price or malformed data)
      "returned": 10                 // ...are in this response (<= maxItems)
    },
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
| 502 | `blocked` | PerimeterX blocked the session twice. "Press & Hold" challenges are solved in place first; otherwise sessions are replaced automatically |
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
17:26:06.775 INFO  [req 892d46 +0.00s] POST /url sort=cheapest max=10 url=https://www.skyscanner.co.in/transport/flights/blr/del/261223/?adultsv2=1&cabinclass=economy
17:26:06.778 INFO  [req 892d46 +0.00s] session 58dad6aa0d23 acquired
17:26:07.190 INFO  [req 892d46 +0.41s] url fetched · route blr=95673351 → del=95673498 in 412ms
17:26:08.306 INFO  [req 892d46 +1.53s] search created · found 10 flights · incomplete
17:26:10.020 INFO  [req 892d46 +3.25s] poll 2 · found 270 flights (+260) · incomplete
17:26:10.925 INFO  [req 892d46 +4.15s] poll 3 · found 270 flights (+0) · incomplete
17:26:14.727 INFO  [req 892d46 +7.95s] poll 5 · found 270 flights (+0) · complete
17:26:14.880 INFO  [req 892d46 +8.11s] complete · 270/270 flights parsed in 5 requests · search 7.54s, first results 1.11s
17:26:14.881 INFO  [req 892d46 +8.11s] pass · 10/270 flights (0 failed) · top ₹9,537, 360 min · 8.11s
17:26:14.883 INFO  [req 892d46 +8.11s] saved output/20261119-172614_blr-del_cheapest_pass_892d46.json
```

| Line | Meaning |
|---|---|
| `url fetched · route …` | The search page was fetched once to look up the airports' Skyscanner ids (later searches on the route say `cached`) |
| `search created` / `poll N` | One API request each; `found` counts distinct flights so far, `(+N)` the new ones, then Skyscanner's status |
| `complete` / `deadline reached` | Why the search stopped |
| `pass` / `fail` | What the response contained |
| `[pool] session … retired` | A session was blocked or broke and is being replaced with a new IP |

To keep logs in a file: `bun start 2>&1 | tee -a logs/server.log`. To turn logs off: `LOGGING=disabled`.
Output files are still saved when logging is off.

## Output files
Every `/url` search response is saved to `output/` (git ignores it), named
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
- A search uses about 0.5–4 MB of proxy traffic.

## Deploy (AWS Lightsail / any Ubuntu server)

On the server, from a clone of this repository:

```bash
bash deploy/install.sh     # 1st run: installs xvfb, Chrome, Bun and creates .env (generated API_KEY)
nano .env                  # set PROXY_URL and POOL_SIZE
bash deploy/install.sh     # installs and starts the `skyscanner` service
bash deploy/check.sh       # health + one live search
```

Updates: `git pull && bash deploy/install.sh && bash deploy/check.sh`. Full guide (rollback, verification, operations): [DEPLOYMENT.md](DEPLOYMENT.md).

## Troubleshooting
| Symptom | Fix |
|---|---|
| `no_session` right after start | Wait for `first browser session ready`; the first session takes about 5–7 s |
| `[pool] session … failed to start: … ENOENT` | Chrome wasn't found: set `CHROME_PATH` to your Chrome binary |
| `blocked` on every search | The IP is flagged: use a residential proxy, and on a server run under `xvfb-run` |
| `upstream_error: could not resolve places` | The URL's airport or city codes are wrong, or the site has no page for that route |
| `upstream_error: … no results within 12000 ms` | Skyscanner was slow: retry |
| Port already in use | Change `PORT`, or stop the old server (`pkill -f "bun src/main.ts"`) |

## Project structure
```
routes/url → parseSearchRequest → FlightSearchService.search
         → SessionPool.acquire (least-busy warmed Chrome) → resolveRoute (airport ids, cached)
         → runUnifiedSearch (create + poll, one in-page fetch per step, logged) → rankItineraries
         → SearchEnvelope → saved to output/
```

```
src/
├── main.ts                          entry point: config → logger → pool → HTTP server
├── server.ts                        HTTP bootstrap only: Bun.serve + routes
├── errors.ts                        domain errors, mapped to failed.code
├── config/app-config.ts             AppConfig, loadAppConfig (env)
├── logging/logger.ts                createLogger: compact, timed, leveled log lines
├── output/search-output-writer.ts   saveSearchOutput: one JSON file per search
├── routes/                          every endpoint lives here, one file per route
│   ├── index.ts                     createRoutes: the route table (add /details here later)
│   ├── route-context.ts             RouteContext: search service, pool health, API key, output dir
│   ├── health.route.ts              GET /health
│   └── url.route.ts                 POST /url: input validation, response envelope, handler (logging, saving)
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

## Folder and file guide
What each folder and file is for, in the order a `/url` request passes through them.

### Root
| File | What it does |
|---|---|
| `package.json` | Scripts (`start`, `dev`, `test`, `typecheck`) and dev dependencies |
| `bun.lock` | Locked dependency versions |
| `tsconfig.json` | TypeScript settings (strict mode) |
| `.env.example` | Every setting with a comment; copy it to `.env` (the only place settings are read from) |
| `DEPLOYMENT.md` | Lightsail deployment: first install, update, rollback, verification, operations |
| `deploy/install.sh` | Installs xvfb, Chrome and Bun, creates `.env` on the first run, installs and restarts the `skyscanner` service |
| `deploy/check.sh` | After a deploy: waits for a ready browser, then runs one live search and prints pass/fail |
| `deploy/skyscanner.service` | systemd unit template used by `install.sh` |
| `.gitignore` | Keeps `.env`, `node_modules/`, HAR captures and `/output/` out of git |
| `README.md` | This guide |
| `docs/DESIGN.md` | Research notes: how Skyscanner's API and PerimeterX work, design choices, measured speed and cost |
| `output/` | Created at runtime: one saved JSON file per search (ignored by git) |

### `src/` (entry point and HTTP)
| File | What it does |
|---|---|
| `main.ts` | Starts everything: reads config, turns logging on or off, starts the browser pool and the HTTP server, and shuts down cleanly on Ctrl-C or `SIGTERM` |
| `server.ts` | Starts Bun's HTTP server with the routes from `routes/`, plus a 404 for unknown paths. It contains no endpoint logic |
| `errors.ts` | Named errors (`InvalidSearchUrlError`, `SessionBlockedError`, `SessionNetworkError`, `UpstreamError`, `BrowserError`, …). The `/url` route turns each one into a `failed.code` |

### `src/routes/` (every endpoint)
| File | What it does |
|---|---|
| `index.ts` | The route table: lists every endpoint and connects it to its handler. Add new endpoints here |
| `route-context.ts` | `RouteContext`: what handlers can use (search service, pool health, API key, output folder) |
| `health.route.ts` | `GET /health`: returns the browser pool's state |
| `url.route.ts` | Everything for `POST /url`, in three sections: <br>• **request**: `parseSearchRequest` checks `url`, `max` and `sort` and applies defaults (`max=50`, `sort=best`) <br>• **response**: `SearchEnvelope`, `passEnvelope`, `failEnvelope` (`status`, `timeElapsedMs`, `request`, `result`, `failed`) <br>• **handler**: `createUrlRoute` checks `x-api-key`, assigns a request id, runs the search, logs the result and saves the JSON file |

### `src/search/` (the search itself)
| File | What it does |
|---|---|
| `flight-search-service.ts` | `FlightSearchService.search`: parses the search URL, takes a browser session, looks up the airport ids (cached per route), runs the search, sorts and trims the results, and logs each step. If a session is blocked or its network fails, the service retires it and retries once on a fresh session |

### `src/sessions/` (browser pool)
| File | What it does |
|---|---|
| `session-pool.ts` | `SessionPool`: starts `POOL_SIZE` Chrome sessions and warms each one up on the Skyscanner home page. Each search gets the least busy ready session. A blocked or broken session is replaced with a new proxy IP, with back-off between failed launches. `health()` reports the pool's state |
| `browser-session.ts` | `BrowserSession`: one Chrome with one sticky proxy IP. It tracks searches in progress and requests made, and closes only once its last search ends |

### `src/browser/` (Chrome control)
| File | What it does |
|---|---|
| `chrome-browser.ts` | `ChromeBrowser`: launches Chrome with a temporary profile and controls it over the DevTools protocol (CDP), without Playwright. Its jobs: <br>• block images, fonts and media <br>• answer the proxy's login <br>• `navigate` to pages <br>• `evaluate` scripts inside the page <br>• clean up the profile on close |
| `cdp-connection.ts` | `CdpConnection`: typed client for Chrome's DevTools WebSocket (commands, events, timeouts, closed-connection detection) |
| `cdp-protocol.ts` | Types for the DevTools commands and events this project uses, so `send()` is checked by TypeScript |
| `proxy-settings.ts` | `parseProxyUrl` splits `PROXY_URL` into server, username and password. `proxyForSession` fills in `{session}` so each browser keeps its own sticky IP |

### `src/skyscanner/` (Skyscanner-specific)
| File | What it does |
|---|---|
| `search-url.ts` | `parseSearchUrl`: turns `/transport/flights/{from}/{to}/{yymmdd}/…?adultsv2&childrenv2&cabinclass` into a `FlightSearchQuery`; impossible dates are rejected |
| `unified-search-api.ts` | Skyscanner's search API: the endpoint, `buildUnifiedSearchBody` / `buildUnifiedSearchHeaders`, and typed API responses (`ApiItinerary`, `ApiLeg`, …) |
| `px-challenge.ts` | `solvePressAndHold`: when PerimeterX shows its "Press & Hold" page, moves the mouse to the button, holds it ~10 s with small jitter and releases (same method as the Zillow scraper). A session is replaced only if this fails |
| `unified-search-runner.ts` | `runUnifiedSearch`: the create-then-poll loop. It waits for `complete` within the deadline, reports progress after each request (the `poll N` log lines), and reports blocks, network errors and bad responses |
| `page-scripts.ts` | Functions that run inside the Skyscanner page, so requests use the browser's cookies: <br>• airport-id lookup from the search page <br>• one create or poll request, with results merged by id <br>• collecting the merged results |
| `itinerary.ts` | The public result types: `Itinerary`, `FlightLeg`, `FlightSegment`, `BookingOption`, `SortOrder` |
| `itinerary-normalizer.ts` | `normalizeItinerary` turns Skyscanner's raw itineraries into `Itinerary` objects. `rankItineraries` drops unpriced ones, sorts by `best`, `cheapest` or `fastest`, and keeps `max` |

### `src/config/`, `src/logging/`, `src/output/`
| File | What it does |
|---|---|
| `config/app-config.ts` | `loadAppConfig`: reads the few settings from `.env` and holds the fixed settings (site, deadline, output folder, Chrome lookup) |
| `config/dotenv.ts` | `readDotEnv`: parses `.env` (comments, inline comments, quotes); the only settings source |
| `logging/logger.ts` | `createLogger`: compact log lines (`time LEVEL [scope +elapsed] message`), the `LOGGING` switch, and escaping so input can't forge log lines |
| `output/search-output-writer.ts` | `saveSearchOutput`: writes each response to `output/` as `{time}_{from}-{to}_{sort}_{pass\|fail}_{id}.json` |

### `test/` (`bun test`, no network needed)
| File | What it tests |
|---|---|
| `fixtures/web-unified-search.san-sfo.json` | A captured live API response used by the parser tests |
| `routes/routes.test.ts` | `/url` and `/health` end to end against a fake search: defaults, errors, API key, saved files, 404 |
| `skyscanner/search-url.test.ts` | URL parsing and rejection of bad URLs and dates |
| `skyscanner/unified-search-api.test.ts` | That the request body matches what Skyscanner's website sends |
| `skyscanner/unified-search-runner.test.ts` | The create/poll loop: merging, deadline, 403, network drops, invalid JSON |
| `skyscanner/page-scripts.test.ts` | Airport-id lookup, and its timeout and network-failure cases |
| `skyscanner/itinerary-normalizer.test.ts` | Normalizing, sorting, `max`, missing fields |
| `logging/logger.test.ts` | Log format, levels, `LOGGING=disabled`, newline escaping |
| `output/search-output-writer.test.ts` | Output file names and contents |

