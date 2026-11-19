# Deploy to Lightsail

The API runs on the VM as the `skyscanner` systemd service on `127.0.0.1:8000`; Caddy (already set up)
publishes it on port 80. Settings live only in the VM's `.env`, which is never committed.

| Setting | Value |
|---|---|
| Repository / branch | [kevin-t11/skyscanner-scaper](https://github.com/kevin-t11/skyscanner-scaper) / `main` |
| Application | `/home/ubuntu/skyscanner-scaper` |
| Service | `skyscanner` (`deploy/skyscanner.service`: `xvfb-run bun src/main.ts`) |
| Public API | `http://<LIGHTSAIL_IP>` (`POST /url`, `GET /health`) |

## First install

```bash
git clone https://github.com/kevin-t11/skyscanner-scaper.git ~/skyscanner-scaper
cd ~/skyscanner-scaper
bash deploy/install.sh     # installs xvfb, Chrome, Bun; creates .env with a generated API_KEY; stops
nano .env                  # set PROXY_URL and POOL_SIZE
bash deploy/install.sh     # installs and starts the service
bash deploy/check.sh       # waits for a ready browser, then runs one live search
```

Evomi `PROXY_URL` (keep `{session}` so each browser gets its own sticky IP):

```dotenv
PROXY_URL=core-residential.evomi.com:1000:USER:PASS_country-IN_session-{session}_lifetime-30
```

## Update

```bash
cd ~/skyscanner-scaper
git pull
bash deploy/install.sh
bash deploy/check.sh
```

## Roll back

```bash
cd ~/skyscanner-scaper
git log --oneline -5
git checkout <previous-commit>
bash deploy/install.sh
```

Return to the latest version with `git checkout main && git pull && bash deploy/install.sh`.

## Verify

```bash
bash deploy/check.sh                       # on the server: health + one live search with the API_KEY from .env
curl http://<LIGHTSAIL_IP>/health          # from outside, through Caddy
```

`deploy/check.sh` prints one line per step, e.g. `search  pass · 164 flights · cheapest ₹6,254 · 4720 ms`.
Pass a Skyscanner URL to test a specific route: `bash deploy/check.sh '<search url>'`.

## Operations

| Task | Command |
|---|---|
| Live logs | `bash deploy/logs.sh` (only the scraper's lines; `-n 100 --no-pager` for the last 100) |
| Only warnings and errors | `bash deploy/logs.sh \| grep -E "WARN\|ERROR"` |
| Restart (e.g. after editing `.env`) | `sudo systemctl restart skyscanner` |
| Stop / start | `sudo systemctl stop skyscanner` / `sudo systemctl start skyscanner` |

| Symptom | Check |
|---|---|
| `/health` returns 503 with `"live":0` and `launch_errors` growing (see `last_error`) | `journalctl -u skyscanner -n 50`: usually `PROXY_URL` (wrong credentials or format) |
| `502` from Caddy | Service down: `systemctl status skyscanner` |
| Timeout from outside | Port 80 not open in the Lightsail firewall |
