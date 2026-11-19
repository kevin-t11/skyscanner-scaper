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

```jsonc
// abridged response from a live run
{
  "query": { "from": "san", "to": "sfo", "dates": ["2026-12-10", "2026-12-20"], "adults": 1, "childAges": [], "cabin": "ECONOMY" },
  "sort": "cheapest",
  "complete": true,              // false when stopped by `fast` or the deadline
  "total": 814,                  // itineraries Skyscanner returned
  "count": 20,
  "timings": { "resolveMs": 0, "searchMs": 11457, "firstResultsMs": 906, "totalMs": 11753, "requests": 6 },
  "itineraries": [{
    "id": "16088-2612101405--32289-0-16216-2612101541|…",
    "price": 10646.0, "priceFormatted": "₹10,646", "score": 0.999, "tags": ["cheapest"],
    "durationMinutes": 216, "stops": 0, "isSelfTransfer": false, "emissionsKg": null,
    "legs": [{ "origin": { "code": "SAN", "name": "San Diego", "entityId": "95673473" }, "destination": { … },
               "departure": "2026-12-10T14:05:00", "arrival": "2026-12-10T15:41:00", "durationMinutes": 96, "stops": 0,
               "carriers": [{ "code": "F9", "name": "Frontier Airlines", "logoUrl": "…" }],
               "segments": [{ "flightNumber": "F93383", "marketingCarrier": "Frontier Airlines", … }] }],
    "bookingOptions": [{ "agentId": "fron", "agentName": "Frontier", "price": 10646.0, "url": "https://www.skyscanner.co.in/transport_deeplink/…" }]
  }]
}
```

| Status | Meaning |
|---|---|
| 400 | Invalid parameters or not a flight search URL |
| 401 | `API_KEY` is set and `x-api-key` is missing or wrong |
| 502 | Blocked by PerimeterX twice (sessions are replaced automatically), no results before the deadline, or upstream error |
| 503 | No browser session ready yet |

### `GET /health`
Pool state: ready sessions, launches, retirements, and per-session request counts.

## How it works
```
/url → parse URL → entity ids (cached) → least-busy session → in-page create + poll → normalize + sort → JSON
```
- `src/url.ts`: search URL → `SearchQuery`.
- `src/skyscanner.ts`: Skyscanner's request contract and the functions evaluated inside the page.
- `src/browser.ts`: Chrome over raw CDP. It blocks images, fonts and media, answers proxy auth, and never calls `Runtime.enable`.
- `src/pool.ts`: warmed sessions. A session is retired on its first block and replaced with a new proxy IP.
- `src/service.ts`: the `/url` use case, with entity caching and one retry on a fresh session.
- `src/parse.ts`: normalization and sorting.
- `src/server.ts`: HTTP validation and error mapping.

## Development
```bash
bun test          # unit tests (live response fixture, no network)
bun run typecheck
```

When Skyscanner changes its API, re-derive the request with
[agent-browser](https://github.com/vercel-labs/agent-browser) (`agent-browser skills get derive-client`): record a
HAR of a real search and compare it with `buildSearchBody` / `buildHeaders` in `src/skyscanner.ts`.
