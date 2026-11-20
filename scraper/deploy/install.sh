#!/usr/bin/env bash
# Installs and (re)starts the scraper as the `skyscanner` systemd service on Ubuntu.
# Run from the repository folder; safe to re-run after `git pull`.
# Settings come only from .env: the first run creates it from .env.example and stops.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUN="$HOME/.bun/bin/bun"
cd "$APP_DIR"

echo "==> packages (xvfb, Google Chrome, Bun)"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl unzip xvfb >/dev/null
if ! command -v google-chrome >/dev/null; then
  curl -fsSL -o /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq /tmp/chrome.deb >/dev/null
  rm /tmp/chrome.deb
fi
[ -x "$BUN" ] || curl -fsSL https://bun.sh/install | bash >/dev/null

echo "==> dependencies"
"$BUN" install --frozen-lockfile >/dev/null

if [ ! -f .env ]; then
  cp .env.example .env
  sed -i -E "s/^API_KEY=[^#]*/API_KEY=$(openssl rand -hex 16)   /" .env
  chmod 600 .env
  echo "==> created .env with a generated API_KEY; set PROXY_URL and POOL_SIZE, then run this again:"
  echo "    nano $APP_DIR/.env && bash deploy/install.sh"
  exit 0
fi

echo "==> service"
sed -e "s|__USER__|$(whoami)|" -e "s|__APP_DIR__|$APP_DIR|" -e "s|__BUN__|$BUN|" deploy/skyscanner.service \
  | sudo tee /etc/systemd/system/skyscanner.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable -q skyscanner
sudo systemctl restart skyscanner

echo "==> deployed $(git rev-parse --short HEAD) · the browser needs ~10-20 s to warm up"
echo "    check: bash deploy/check.sh · logs: bash deploy/logs.sh"
