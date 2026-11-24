# Skyscanner scraper

A small HTTP API that returns live Skyscanner flight results as JSON.

It keeps a few real Chrome browsers open on skyscanner.co.in and calls Skyscanner's own search API from inside them, so requests carry real browser cookies. Each browser can use its own residential proxy IP.

## Run it

Needs [Bun](https://bun.sh) and Google Chrome.

```bash
cd scraper
bun install
cp .env.example .env   # add your proxy, or leave it empty to use your own connection
bun start              # http://localhost:8000
```

Chrome opens visibly on purpose: Skyscanner blocks headless Chrome. On a server it runs inside an invisible virtual screen (see [DEPLOYMENT.md](DEPLOYMENT.md)).

## Settings (`.env`)

| Name | Default | What it does |
|---|---|---|
| `PROXY_URL` | empty | Residential proxy. `{session}` gives each browser its own sticky IP |
| `PROXY_MODE` | `start` | `start`: browsers pass the bot check through the proxy, then search from the server's own IP; after 3 blocked direct searches in 10 min, or 6 blocked direct warm-ups in a row, new browsers search through the proxy for 30 min. `all`: every search uses the proxy |
| `PROXY_LIMIT_MB` | `1024` | Cap on total proxy traffic, kept in `output/proxy-usage.json` (delete it to reset); past it, everything goes direct |
| `POOL_SIZE` | `1` | Browsers kept open. More browsers = more searches at once (~300 MB each). Searches rotate across them; one is replaced only when blocked or when its proxy turns slow |
| `API_KEY` | empty | When set, every request needs an `x-api-key` header |
| `PORT` | `8000` | HTTP port |
| `STOP_WHEN_STABLE` | `enabled` | Return as soon as no new flights arrive, instead of waiting for Skyscanner's "complete" |
| `LOGGING` | `enabled` | One short log line per step |

## Endpoints

| Endpoint | Use it to |
|---|---|
| `GET /places?q=mumb` | Find the code of a city or airport |
| `POST /search` | Search flights by codes and dates |
| `POST /url` | Search with a Skyscanner URL you already have |
| `GET /health` | Check that the server and browsers are ready |

### 1. Find codes

```bash
curl "localhost:8000/places?q=mumb"
```

Returns places like `{ "name": "Mumbai", "code": "BOM", "type": "airport", "country": "India" }`. City codes such as `NYCA` or `LOND` cover all of that city's airports.

### 2. Search

```bash
curl localhost:8000/search -H 'content-type: application/json' \
  -d '{"from":"BOM","to":"DEL","departDate":"2026-12-15","max":10,"sort":"cheapest"}'
```

| Field | Required | Values |
|---|---|---|
| `from`, `to` | yes | Place codes from `/places` |
| `departDate` | yes | `YYYY-MM-DD` |
| `returnDate` | no | Leave out for one way |
| `cabinClass` | no | `economy` (default), `premium_economy`, `business`, `first` |
| `adults` | no | 1 to 8, default 1 |
| `childAges` | no | One age (0 to 17) per child, up to 8, e.g. `[0, 7]`. Under 2 is an infant on an adult's lap, so at most one per adult |
| `currency` | no | ISO 4217 code for prices and booking links, e.g. `USD`, `EUR`. Default `INR` |
| `max` | no | 1 to 1000 results, default 50 |
| `sort` | no | `best` (default), `cheapest`, `fastest` |

### 3. Or search with a URL

```bash
curl localhost:8000/url -H 'content-type: application/json' \
  -d '{"url":"https://www.skyscanner.co.in/transport/flights/bom/del/261215/","max":10}'
```

`max`, `sort` and `currency` work here too.

## The response

Both searches return the same shape (shortened):

```json
{
  "status": "pass",
  "timeElapsedMs": 3400,
  "result": {
    "complete": true,
    "counts": { "total": 208, "failed": 0, "returned": 10 },
    "searchUrl": "https://www.skyscanner.co.in/transport/flights/bom/del/261215/",
    "itineraries": [{ "price": 5784, "durationMinutes": 130, "stops": 0, "legs": [], "bookingOptions": [] }]
  }
}
```

- `counts.total`: usable flights found. `returned`: how many are in this response.
- `complete: false` means it returned once no new flights arrived, before Skyscanner said it was done.
- `searchUrl`: the same search on the website, to compare.
- On failure, `status` is `"fail"` and `failed` holds a `code` and `message`.

Each response is also saved to `output/`.

## How it works

1. Each browser opens skyscanner.co.in once and gets its anti-bot cookies.
2. A search runs Skyscanner's internal search API (`/g/radar/api/v2/web-unified-search/`) from inside that page.
3. The scraper polls until no new flights arrive, then sorts, trims to `max` and returns.
4. If a browser is blocked or its proxy drops, the search moves to another browser and that one is replaced.

Code lives in `src/`: `routes/` (HTTP endpoints), `services/` (search flow), `sessions/` and `browser/` (Chrome pool), `skyscanner/` (Skyscanner API calls), `parsers/` (URL and result parsing).

## Deploy

See [DEPLOYMENT.md](DEPLOYMENT.md) for the Lightsail server.
