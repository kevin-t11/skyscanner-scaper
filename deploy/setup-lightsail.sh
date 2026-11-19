#!/usr/bin/env bash
# One-shot setup for an Ubuntu (22.04/24.04) Lightsail instance: installs Chrome, Xvfb and Bun,
# clones the scraper, writes .env and runs it as a systemd service on localhost (PORT, default 8000).
# Safe to re-run: it updates the code and restarts the service.
#
#   bash deploy/setup-lightsail.sh            # 1st run creates .env and stops: edit it (PROXY_URL, POOL_SIZE)
#   bash deploy/setup-lightsail.sh            # 2nd run installs and starts the service
#
# Scraper settings come only from .env. Script options: BRANCH (default main),
#   DOMAIN: adds Caddy in front; a domain gets HTTPS, DOMAIN=:80 serves plain HTTP on the server's IP.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/kevin-t11/skyscanner-scaper.git}"
BRANCH="${BRANCH:-main}"
APP_USER="${SUDO_USER:-$(whoami)}"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
APP_DIR="$APP_HOME/skyscanner-scaper"
BUN="$APP_HOME/.bun/bin/bun"
SERVICE=/etc/systemd/system/skyscanner.service

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
as_app() { sudo -u "$APP_USER" -H bash -c "$1"; }

step "System packages"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git curl wget unzip xvfb ca-certificates >/dev/null

if ! command -v google-chrome >/dev/null; then
  step "Google Chrome"
  wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq /tmp/chrome.deb >/dev/null
  rm -f /tmp/chrome.deb
fi

# Chrome needs ~300-700 MB per browser; small instances get a swap file as a safety net.
if [ "$(free -m | awk '/^Mem:/{print $2}')" -lt 3000 ] && ! swapon --show | grep -q .; then
  step "2 GB swap file"
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

if [ ! -x "$BUN" ]; then
  step "Bun"
  as_app "curl -fsSL https://bun.sh/install | bash" >/dev/null
fi

step "Code ($BRANCH)"
if [ -d "$APP_DIR/.git" ]; then
  as_app "cd '$APP_DIR' && git fetch -q origin && git checkout -q '$BRANCH' && git pull -q --ff-only"
else
  as_app "git clone -q -b '$BRANCH' '$REPO_URL' '$APP_DIR'"
fi
as_app "cd '$APP_DIR' && '$BUN' install --frozen-lockfile >/dev/null"

step ".env"
# All settings live in .env; nothing is taken from this shell's environment.
if [ ! -f "$APP_DIR/.env" ]; then
  as_app "cp '$APP_DIR/.env.example' '$APP_DIR/.env'"
  sed -i -E "s/^API_KEY=[^#]*/API_KEY=$(openssl rand -hex 16)   /" "$APP_DIR/.env"
  echo "CHROME_PATH=$(readlink -f "$(command -v google-chrome)")" >> "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo "created $APP_DIR/.env (API_KEY generated). Set PROXY_URL and POOL_SIZE in it, then run this script again:"
  echo "  nano $APP_DIR/.env"
  exit 0
fi
echo "using $APP_DIR/.env"
grep -qE '^PROXY_URL=[^[:space:]#]' "$APP_DIR/.env" || echo "warning: PROXY_URL is empty in .env; searches use the server's own IP"
APP_PORT="$(sed -nE 's/^PORT=([0-9]+).*/\1/p' "$APP_DIR/.env" | tail -1)"
APP_PORT="${APP_PORT:-8000}"
APP_POOL="$(sed -nE 's/^POOL_SIZE=([0-9]+).*/\1/p' "$APP_DIR/.env" | tail -1)"
APP_POOL="${APP_POOL:-1}"

step "systemd service"
sudo tee "$SERVICE" >/dev/null <<UNIT
[Unit]
Description=Skyscanner scraper (headful Chrome on a virtual display)
After=network-online.target
Wants=network-online.target
# Stop restarting after 5 crashes in 60 s (e.g. Chrome missing or the port taken).
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/xvfb-run -a $BUN src/main.ts
Restart=always
RestartSec=5
# ~700 MB per browser plus the server; systemd restarts the service if Chrome leaks past it.
MemoryMax=$((600 + 700 * APP_POOL))M
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable -q skyscanner
sudo systemctl restart skyscanner

# Saved responses: keep 7 days.
echo "17 3 * * * $APP_USER find $APP_DIR/output -name '*.json' -mtime +7 -delete" | sudo tee /etc/cron.d/skyscanner-output >/dev/null

if [ -n "${DOMAIN:-}" ]; then
  step "Caddy reverse proxy for $DOMAIN"
  if ! command -v caddy >/dev/null; then
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null
    curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq caddy >/dev/null
  fi
  printf '%s {\n\treverse_proxy localhost:%s\n}\n' "$DOMAIN" "$APP_PORT" | sudo tee /etc/caddy/Caddyfile >/dev/null
  sudo systemctl reload caddy || sudo systemctl restart caddy
  echo "open port 80 (and 443 for a domain) in the Lightsail firewall (Networking tab)"
fi

step "Waiting for the first browser session"
for _ in $(seq 1 60); do
  if curl -fs "localhost:$APP_PORT/health" 2>/dev/null | grep -q '"ready":[1-9]'; then
    echo "ready: $(curl -fs "localhost:$APP_PORT/health" | head -c 200)"
    echo
    echo "logs:   journalctl -u skyscanner -f"
    echo "search: curl localhost:$APP_PORT/url -H 'x-api-key: <API_KEY>' -H 'content-type: application/json' -d '{\"url\":\"<skyscanner url>\",\"max\":10,\"sort\":\"cheapest\"}'"
    exit 0
  fi
  sleep 2
done
echo "no browser session ready after 2 min; check: journalctl -u skyscanner -n 50" >&2
exit 1
