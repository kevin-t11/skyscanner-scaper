#!/usr/bin/env bash
# After a deploy: waits for a ready browser, then runs one live search with the API_KEY from .env.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="$(sed -nE 's/^PORT=([0-9]+).*/\1/p' .env | tail -1)"
BASE="http://localhost:${PORT:-8000}"
KEY="$(sed -nE 's/^API_KEY=([^[:space:]#]*).*/\1/p' .env | tail -1)"
SEARCH_URL="${1:-https://www.skyscanner.co.in/transport/flights/bom/blr/$(date -d '+30 days' +%y%m%d)/?adultsv2=1&cabinclass=economy}"

printf 'health  '
for _ in $(seq 60); do
  if curl -fs "$BASE/health" | grep -q '"ready":[1-9]'; then curl -fs "$BASE/health"; echo; break; fi
  sleep 2
done
curl -fs "$BASE/health" | grep -q '"ready":[1-9]' || { echo "no ready browser after 2 min; see journalctl -u skyscanner -n 50"; exit 1; }

printf 'search  '
curl -s "$BASE/url" -H "x-api-key: $KEY" -H 'content-type: application/json' \
  -d "{\"url\":\"$SEARCH_URL\",\"max\":3,\"sort\":\"cheapest\"}" \
  | "$HOME/.bun/bin/bun" -e '
    const r = await Bun.stdin.json();
    const top = r.result?.itineraries?.[0];
    console.log(r.status === "pass"
      ? `pass · ${r.result.counts.passed} flights · cheapest ${top?.priceFormatted ?? "-"} · ${r.timeElapsedMs} ms`
      : `fail · ${r.failed?.code}: ${r.failed?.message}`);
    process.exit(r.status === "pass" ? 0 : 1);'
