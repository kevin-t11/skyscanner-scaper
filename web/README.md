# Fareline web

A small Next.js app on top of the scraper: sign in, pick a route and a date, and browse live Skyscanner results.

## Run it

```bash
cd web
bun install
cp .env.example .env.local   # fill in the Clerk keys and the scraper URL
bun dev                      # http://localhost:3000
```

Start the scraper first (`cd scraper && bun start`), or point `SCRAPER_URL` at the server.

## Settings (`.env.local`)

| Name | What it is |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk keys (dashboard → API keys) |
| `SCRAPER_URL` | Scraper base URL, e.g. `http://localhost:8000` |
| `SCRAPER_API_KEY` | The scraper's `API_KEY`, if it has one. Only used on the server |

## How it fits together

- `/` is the landing page; `/sign-in` and `/sign-up` are Clerk.
- `/search` needs a signed-in user (`proxy.ts`).
- The browser only calls this app's `/api/places` and `/api/search`. Those routes add the API key and forward to the scraper, so the key never reaches the browser.
- UI components come from [beui.dev](https://beui.dev) (`components/motion/`, kept as published). Icons are Hugeicons in `components/icons.tsx`. Colours are the black and white tokens in `app/globals.css`.

## Checks

```bash
bun run lint
bunx tsc --noEmit
bun run build
```
