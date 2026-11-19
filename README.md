# Skyscanner flight scraper

An HTTP service that searches Skyscanner flights by fields (`POST /search`) or by search URL (`POST /url`) and returns the itineraries as sorted JSON.

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
| `API_KEY` | none | When set, `/search`, `/url` and `/places` require the `x-api-key` header |
| `LOGGING` | `enabled` | `enabled` prints the server logs; `disabled` turns them all off |
| `STOP_WHEN_STABLE` | `enabled` | Return after the first poll that adds no flights (`complete: false`, usually 2–4 s sooner); `disabled` waits for Skyscanner's `complete` |
| `CHROME_PATH` | found automatically | Only needed if Chrome is installed somewhere unusual |

Fixed settings, changed in <code>src/config/app-config.ts</code> if ever needed:
- **Site:** `www.skyscanner.co.in`, market `IN`, locale `en-GB`, prices in `INR`.
- **Search deadline:** 12 s; partial results are returned after that.
- **Output folder:** `output/`.
- **Browser:** headful Chrome, because the search API blocks headless Chrome.

## API

All search endpoints return the same envelope; `x-api-key` is required on `/search`, `/url` and `/places` when `API_KEY` is set.

### `POST /search` (main endpoint)
```bash
curl localhost:8000/search -H 'content-type: application/json' \
  -d '{"from":"BOM","to":"GOI","departDate":"2026-12-15","returnDate":"2026-12-22","cabinClass":"economy","adults":1,"max":10,"sort":"cheapest"}'
```
| Field | Default | Meaning |
|---|---|---|
| `from`, `to` | required | Skyscanner place code, any case: airport (`BOM`, `JFK`) or city with all its airports (`NYCA`, `LOND`, `DXBA`). Find codes with `GET /places` |
| `departDate` | required | `YYYY-MM-DD` |
| `returnDate` | none | `YYYY-MM-DD`; omit for one-way |
| `cabinClass` | `economy` | `economy`, `premium_economy`, `business`, `first` |
| `adults` | `1` | 1–8 |
| `max`, `sort` | `50`, `best` | As for `/url` |

`request.searchUrl` (also on failures) and `result.searchUrl` are the same search on the website, to verify results.
`result.places` shows what each code resolved to.

### `GET /places?q=mumb&type=from`
Autocomplete for the From (`type=from`, default) or To (`type=to`) box:
```json
{"query":"mumb","type":"from","places":[
  {"name":"Mumbai","code":"IBOM","iata":"BOM","type":"city","entityId":"27539520","city":"Mumbai","country":"India"},
  {"name":"Mumbai","code":"BOM","iata":"BOM","type":"airport","entityId":"95673320","city":"Mumbai","country":"India"}]}
```
Use a place's `code` as `from` / `to` in `/search`.

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
    "complete": true,                // false when stopped early (stable results or the 12 s deadline)
    "counts": {                      // how many itineraries...
      "total": 270,                  // ...were found and usable
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
Same shape as the Zillow scraper's: HTTP 200 while at least one browser is ready, 503 otherwise.

```json
{
  "status": "ok",                  // ok | warming | no-browsers
  "size": 1, "live": 1, "warming": 0,
  "launched": 1, "retired": 0, "launch_errors": 0,
  "last_error": null,              // last launch failure or retirement reason
  "oldest_session_age_s": 312.4,
  "last_success_at": "2026-11-19T15:20:41.512Z",
  "proxy": true
}
```

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
Every `/search` and `/url` response is saved to `output/` (git ignores it), named
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
POST /search ─┐                         GET /places
POST /url    ─┴→ routes/ (validate, envelope, log, save)      │
               → services/flight-search.service.ts ←──────────┘
                   places (autocomplete, cached) → entity ids
                   → sessions/session-pool (warm headful Chrome, one proxy IP each)
                   → skyscanner/unified-search-runner (create + poll, in-page fetch)
                   → parsers/itinerary-normalizer (parse, count, sort, top max)
               → SearchEnvelope → utils/output-writer → output/
```

```
src/
├── main.ts, server.ts, errors.ts
├── config/      app-config.ts (settings from .env), dotenv.ts
├── routes/      search.route.ts, url.route.ts, places.route.ts, health.route.ts, index.ts, route-context.ts
├── services/    flight-search.service.ts
├── sessions/    session-pool.ts, browser-session.ts
├── browser/     chrome-browser.ts, cdp-connection.ts, cdp-protocol.ts, proxy-settings.ts
├── skyscanner/  unified-search-api.ts, unified-search-runner.ts, places.ts, page-scripts.ts, px-challenge.ts
├── parsers/     search-url.ts, itinerary-normalizer.ts
├── types/       itinerary.ts
└── utils/       logger.ts, output-writer.ts
deploy/          install.sh, skyscanner.service, check.sh, logs.sh
```

## Development
```bash
bun run typecheck   # tsc --noEmit
bun run dev         # restart on file changes
```

When Skyscanner changes its API, re-derive the request with
[agent-browser](https://github.com/vercel-labs/agent-browser) (`agent-browser skills get derive-client`). Record a
HAR of a real search and compare it with `buildUnifiedSearchBody` / `buildUnifiedSearchHeaders` in
`src/skyscanner/unified-search-api.ts`.

## Folder and file guide

| Folder | File | What it does |
|---|---|---|
| `src/` | `main.ts` | Entry point: loads `.env` settings, starts the browser pool and the HTTP server, shuts down cleanly |
| | `server.ts` | `Bun.serve` on `127.0.0.1:PORT` with the route table |
| | `errors.ts` | Domain errors (`InvalidSearchUrlError`, `PlaceNotFoundError`, `SessionBlockedError`, …) mapped to failure codes |
| `config/` | `app-config.ts` | `loadAppConfig`: `PROXY_URL`, `PORT`, `POOL_SIZE`, `API_KEY`, `LOGGING`, `STOP_WHEN_STABLE`, `CHROME_PATH`; fixed site settings (co.in, IN, INR) |
| | `dotenv.ts` | Reads `.env`, the only settings source |
| `routes/` | `index.ts` | Route table: `/search`, `/url`, `/places`, `/health` |
| | `search.route.ts` | `POST /search`: validates `from`, `to`, dates, `cabinClass`, `adults` |
| | `url.route.ts` | `POST /url`, plus the shared flight-search handler: envelope, API key, logging, saving |
| | `places.route.ts` | `GET /places`: autocomplete |
| | `health.route.ts` | `GET /health`: pool state; 200 while a browser is live, else 503 |
| | `route-context.ts` | What every handler receives (service, pool health, API key, output folder) |
| `services/` | `flight-search.service.ts` | The use case: resolve places (cached), take a session, run the search, rank; retry once on a fresh session; challenge strategy |
| `sessions/` | `session-pool.ts` | Keeps `POOL_SIZE` warm browsers; replaces blocked or broken ones; health counters |
| | `browser-session.ts` | One browser with its state and request counters |
| `browser/` | `chrome-browser.ts` | Launches Chrome and drives it over CDP: stealth settings, proxy login, blocks images/fonts/media |
| | `cdp-connection.ts`, `cdp-protocol.ts` | Minimal typed Chrome DevTools Protocol client |
| | `proxy-settings.ts` | Parses `PROXY_URL`, fills `{session}` per browser |
| `skyscanner/` | `unified-search-api.ts` | Request/response models and builders for the flight search API |
| | `unified-search-runner.ts` | Create-then-poll loop: deadline, stable stop, failure classification |
| | `places.ts` | Autocomplete API: in-page call, `Place` model, `pickPlace` matching |
| | `page-scripts.ts` | Functions that run inside the page (search steps, search-page fallback lookup) |
| | `px-challenge.ts` | "Press & Hold" challenge solver |
| `parsers/` | `search-url.ts` | `parseSearchUrl` (URL → query) and `buildSearchUrl` (query → website URL) |
| | `itinerary-normalizer.ts` | Raw itineraries → `Itinerary`; counts; sorting; top `max` |
| `types/` | `itinerary.ts` | Public result types: `Itinerary`, `FlightLeg`, `BookingOption`, `SortOrder` |
| `utils/` | `logger.ts` | Compact timed log lines, `LOGGING` switch |
| | `output-writer.ts` | Saves each search response to `output/` |
| `deploy/` | `install.sh`, `skyscanner.service`, `check.sh`, `logs.sh` | Server install/restart, systemd unit, post-deploy check, compact logs (see DEPLOYMENT.md) |
