# Deploy to Lightsail

Same model as the Zillow scraper: the API runs on the VM as a systemd service bound to
`127.0.0.1:8000`, a reverse proxy (Caddy here, nginx there) publishes it on port 80, and
updates are manual: push a commit, upload that same commit over SSH, test it on the VM,
then restart the service. A GitHub push alone does not deploy. Run one deployment at a time.

| Setting | Value |
|---|---|
| Repository / branch | [kevin-t11/skyscanner-scaper](https://github.com/kevin-t11/skyscanner-scaper) / `main` |
| SSH target | `ubuntu@<LIGHTSAIL_IP>` |
| SSH key on Kevin's Mac | `~/.ssh/<lightsail-key>.pem` (Lightsail default key of the instance's region) |
| Application | `/home/ubuntu/skyscanner-scaper` |
| Service / runtime | `skyscanner` / `xvfb-run /home/ubuntu/.bun/bin/bun src/main.ts` |
| Reverse proxy | Caddy, `/etc/caddy/Caddyfile`: `:80 → localhost:8000` |
| Public API | `http://<LIGHTSAIL_IP>` (`POST /url`, `GET /health`) |

Credentials live only in the VM's `.env` (`PROXY_URL`, `API_KEY`); it is never uploaded or committed.

## 0. First-time setup — once per VM

1. Lightsail: Ubuntu 24.04, 2 GB RAM or more (about 700 MB per browser in `POOL_SIZE`),
   attach a static IP, and under Networking → IPv4 firewall add **HTTP (80)**.
2. On your Mac, connect:
   ```bash
   chmod 600 ~/.ssh/<lightsail-key>.pem
   ssh -i ~/.ssh/<lightsail-key>.pem ubuntu@<LIGHTSAIL_IP>
   ```
3. On the VM, run the setup script. It installs Chrome, Xvfb, Bun, swap, the code, `.env`,
   the `skyscanner` service, a daily `output/` cleanup, and Caddy on port 80:
   ```bash
   git clone https://github.com/kevin-t11/skyscanner-scaper.git ~/skyscanner-scaper
   cd ~/skyscanner-scaper
   DOMAIN=:80 POOL_SIZE=1 \
   PROXY_URL='core-residential.evomi.com:1000:USER:PASS_country-IN_session-{session}_lifetime-30' \
   bash deploy/setup-lightsail.sh
   ```
   Save the printed `API_KEY` (also in `~/skyscanner-scaper/.env`). With a real domain, use
   `DOMAIN=api.example.com` instead and also open port 443: Caddy then issues HTTPS certificates.
4. From your Mac: `curl http://<LIGHTSAIL_IP>/health`

## 1. Test and push — on your Mac

```bash
cd ~/Depot/Projects/skyscanner-scaper
git status --short
bun install
bunx tsc --noEmit
bun test
git push origin main
git rev-parse HEAD
git ls-remote origin refs/heads/main
```

Continue when the working tree is clean and the two commit hashes match.

## 2. Upload — on your Mac

The archive contains committed files only; it excludes `.env`, `node_modules` and `output/`.

```bash
git archive --format=tar.gz --output=/tmp/skyscanner-release.tar.gz HEAD
git rev-parse HEAD > /tmp/skyscanner-commit.txt
scp -i ~/.ssh/<lightsail-key>.pem /tmp/skyscanner-release.tar.gz /tmp/skyscanner-commit.txt ubuntu@<LIGHTSAIL_IP>:/tmp/
ssh -i ~/.ssh/<lightsail-key>.pem ubuntu@<LIGHTSAIL_IP>
```

Run the remaining steps in that SSH terminal. If a command fails, fix it before continuing.

## 3. Stage and test — on Lightsail

The release is built and tested in its own folder, away from the running service.

```bash
set -e
APP=/home/ubuntu/skyscanner-scaper
BUN=/home/ubuntu/.bun/bin/bun
RELEASE=/home/ubuntu/skyscanner-deploy-backups/$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$RELEASE/stage" "$RELEASE/previous"
tar -xzf /tmp/skyscanner-release.tar.gz -C "$RELEASE/stage"
cp /tmp/skyscanner-commit.txt "$RELEASE/commit.txt"
cd "$RELEASE/stage"
"$BUN" install --frozen-lockfile
"$BUN" test
```

## 4. Back up, install, and restart — on Lightsail

This interrupts the API for the ~10–20 s a browser needs to warm up. Save the printed path for rollback.
`.env` and `output/` stay in place.

```bash
for item in src test deploy docs node_modules package.json bun.lock tsconfig.json README.md DEPLOYMENT.md .env.example; do
  cp -a "$APP/$item" "$RELEASE/previous/" 2>/dev/null || true
done
printf 'Release and rollback folder: %s\n' "$RELEASE"
sudo systemctl stop skyscanner
for dir in src test deploy docs node_modules; do
  rsync -a --delete "$RELEASE/stage/$dir/" "$APP/$dir/"
done
for file in package.json bun.lock tsconfig.json README.md DEPLOYMENT.md .env.example; do
  cp "$RELEASE/stage/$file" "$APP/$file"
done
sudo systemctl start skyscanner
```

## 5. Verify — on Lightsail

```bash
systemctl is-active skyscanner caddy
cat "$RELEASE/commit.txt"
sleep 20; curl --silent --show-error http://127.0.0.1:8000/health
```

`"ready": 1` (or `POOL_SIZE`) means a browser is warm. Then run a real search through Caddy:

```bash
KEY=$(sed -n 's/^API_KEY=//p' "$APP/.env")
curl --fail --silent --show-error --max-time 60 http://<LIGHTSAIL_IP>/url \
  -H "x-api-key: $KEY" -H 'content-type: application/json' \
  -d '{"url":"https://www.skyscanner.co.in/transport/flights/bom/blr/261226/?adultsv2=1&cabinclass=economy","max":5,"sort":"cheapest"}' \
  | head -c 400; echo
```

Check `"status":"pass"` and `result.counts`, not only the HTTP status. Logs: `journalctl -u skyscanner -n 80 --no-pager`.

## Rollback — on Lightsail

Set `APP` and `RELEASE` again in a new terminal; use the path saved in step 4.

```bash
set -e
sudo systemctl stop skyscanner
for dir in src test deploy docs node_modules; do
  rsync -a --delete "$RELEASE/previous/$dir/" "$APP/$dir/"
done
for file in package.json bun.lock tsconfig.json README.md DEPLOYMENT.md .env.example; do
  cp "$RELEASE/previous/$file" "$APP/$file" 2>/dev/null || true
done
sudo systemctl start skyscanner
```

Repeat the checks in step 5. Delete old release folders in `~/skyscanner-deploy-backups` when no longer needed.

## Operations

| Task | Command |
|---|---|
| Live logs | `journalctl -u skyscanner -f` |
| Restart | `sudo systemctl restart skyscanner` |
| Change settings | `nano ~/skyscanner-scaper/.env`, then restart |
| Caddy status / logs | `systemctl status caddy` / `journalctl -u caddy -f` |
| Caddy config | `sudo nano /etc/caddy/Caddyfile`, then `sudo systemctl reload caddy` |

| Symptom | Check |
|---|---|
| Timeout from outside | Port 80 not open in the Lightsail firewall |
| `502 Bad Gateway` | Service down: `systemctl status skyscanner`, `curl localhost:8000/health` |
| `/url` returns 503 `no_session` | Browsers fail to start: `journalctl -u skyscanner -n 50` (often proxy credentials) |
| Caddy will not start | Port 80 used by nginx/Apache: `sudo systemctl disable --now nginx apache2` |
