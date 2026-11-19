# Skyscanner scraper: design

## Goal
`GET /url?url=<skyscanner search URL>&max=50&sort=cheapest|best|fastest` returns normalized itineraries as JSON,
as fast and as cheaply as possible.

## What we know (verified 2026-11-19)
| Fact | Evidence |
|---|---|
| The whole site is behind PerimeterX (app `PXrf8vapwA`) | curl → 307 `/sttc/px/captcha-v2/` |
| HTML has **no flights and no `__NEXT_DATA__`**; `window["__internal"]` holds the parsed search (entity ids) | SSR search page |
| Flights come from `POST /g/radar/api/v2/web-unified-search/`, polled with `GET …/{context.sessionId}` | JS chunk `8485.*.chunk.js`, a captured browser request |
| Plain HTTP (curl, curl_cffi, Bun fetch) with server-issued cookies gets **403 `{"reason":"blocked"}`** | live |
| **Headless** Chrome passes the page but its API calls get 403; **headful** Chrome (Xvfb) gets 200 | live, same IP |
| `fetch()` inside a headful page made ~110 API requests (5 complete searches) before the first 403, from a datacenter IP | live |
| `_pxhd` + `_pxvid` cookies exported from a cleared browser work over plain HTTP from another IP, but are burned after ~8–20 requests | live |
| Polls return the full result set but sometimes an empty list; results must be merged by id | live |
| One-way search: ~10 results on create, 50+ after ~1–1.6 s, `complete` after 8–12 s (75–940 itineraries) | live |
| Full response for 943 itineraries is ~7.6 MB of JSON (gzip on the wire) | live |

### Request contract (from Skyscanner's own bundle)
```jsonc
POST /g/radar/api/v2/web-unified-search/
Headers: Accept: application/json, Content-Type: application/json,
  X-Skyscanner-ChannelId: website, X-Skyscanner-Market: US, X-Skyscanner-Locale: en-US,
  X-Skyscanner-Currency: USD, X-Skyscanner-ViewId: <uuid>, X-Skyscanner-Traveller-Context: <utid>
Body: { "cabinClass": "ECONOMY", "childAges": [], "adults": 1,
        "legs": [{ "legOrigin": {"@type":"entity","entityId":"95565050"},
                   "legDestination": {"@type":"entity","entityId":"95565058"},
                   "dates": {"@type":"date","year":"2026","month":"12","day":"15"} }],
        "options": { /* optional: includeOriginNearbyAirports, fareAttributes */ } }
Poll:  GET /g/radar/api/v2/web-unified-search/{encodeURIComponent(context.sessionId)} until context.status == "complete"
```

## Architecture
```
HTTP (Bun.serve)  /url  /health
        │
        ▼
SearchService ── parse URL ─► entity cache (LRU)  ─miss─► in-page fetch(search URL) → __internal.searchParams
        │
        ▼
SessionPool (N workers, least-busy)          one worker = 1 headless Chrome + 1 tab + 1 sticky proxy IP
        │                                     warm-up: open home page once → PX sensor sets _px3
        ▼                                     health: 403/captcha → retire, relaunch with a new proxy session
in-page fetch(): create → poll (adaptive 250ms→1s) → stop at complete | enough results (fast mode) | deadline
        │
        ▼
parse + sort (Skyscanner sortingOptions if present, else cheapest/fastest/best) → slice(max) → JSON
```

Why each choice:
- **Bun + TypeScript, raw CDP over WebSocket, no Playwright**: one dependency-free process with fast startup and the
  smallest memory use. We never call `Runtime.enable`, which is the main CDP signal anti-bot scripts look for.
- **Headful Chrome (under Xvfb), not headless, Lightpanda or plain HTTP**: the only option that got 200 from the API
  repeatedly. Exported cookies replayed over HTTP are burned within one search.
- **In-page `fetch()`**: requests carry the browser's own TLS, cookies and sensor state. The browser never renders
  results, and the response is plain JSON.
- **Resource blocking via CDP `Fetch`** (images, fonts, media) and proxy auth handled through `Fetch.authRequired`.
  This saves proxy GB. The `js.skyscnr.com` CDN goes around the proxy (`--proxy-bypass-list`).
- **agent-browser** (`derive-client` skill) for re-deriving the contract: record a HAR of a real search when Skyscanner
  changes its bundle. It is not on the runtime path.

## Latency (measured live on this server, 2026-11-19)
| Step | Time |
|---|---|
| Session warm-up (Chrome launch + home page + sensor) | 4.5–7 s, once per session |
| URL → entity ids (in-page fetch of the search page) | ~430 ms, then 0 (cached per route) |
| `fast=true`, `max` ≤ 10 | ~1.3 s (create + 1 poll) |
| First 50+ itineraries | 0.9–1.7 s |
| `complete` (all agents answered) | 8–12 s; capped by the 12 s search deadline (`SEARCH_DEADLINE_MS` in `src/config/app-config.ts`) |

## Cost (estimate)
- A full poll for 943 itineraries is ~490 KB gzip on the wire; early polls are smaller. With the 600 ms poll interval a
  complete search is roughly 1–4 MB, so **~$0.5–2 per 1,000 complete searches** at Evomi's $0.49/GB.
- `fast=true` stops after 1–2 requests (~10–100 KB), so **under $0.05 per 1,000**.
- Session warm-up is ~0.3–0.8 MB (images, fonts and media blocked; `*.skyscnr.com` CDN bypasses the proxy).
- Apify actors charge ~$1 per 1,000 *itineraries*; one complete search here returns 75–940 itineraries.

## Proxy providers (residential, per GB, from pricing pages 2026-11-19)
| Provider | PAYG | Volume |
|---|---|---|
| Evomi Core Residential | $0.99 | $0.49 (100 GB/mo plan) |
| DataImpulse | $1.00 | $0.50 |
| Proxy-Cheap | — | from $0.78 |
| Webshare | — | $1.40–3.50 |
| IPRoyal | $1.75–7.00 | |
| Decodo | $2–4 | |
