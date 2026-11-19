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
bash deploy/install.sh     # runs the tests, installs and starts the service, waits for a ready browser
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
```

The script stops before restarting if the tests fail, so a broken commit never replaces the running version.

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
curl http://<LIGHTSAIL_IP>/health          # "ready": 1 or more
KEY=$(sed -nE 's/^API_KEY=([^ #]*).*/\1/p' ~/skyscanner-scaper/.env)
curl http://<LIGHTSAIL_IP>/url -H "x-api-key: $KEY" -H 'content-type: application/json' \
  -d '{"url":"https://www.skyscanner.co.in/transport/flights/bom/blr/261226/?adultsv2=1&cabinclass=economy","max":5,"sort":"cheapest"}'
```

Check `"status":"pass"` and `result.counts`, not only the HTTP status.

## Operations

| Task | Command |
|---|---|
| Live logs | `journalctl -u skyscanner -f` |
| Restart (e.g. after editing `.env`) | `sudo systemctl restart skyscanner` |
| Stop / start | `sudo systemctl stop skyscanner` / `sudo systemctl start skyscanner` |

| Symptom | Check |
|---|---|
| `/health` shows `"ready":0` and `launchErrors` growing | `journalctl -u skyscanner -n 50`: usually `PROXY_URL` (wrong credentials or format) |
| `502` from Caddy | Service down: `systemctl status skyscanner` |
| Timeout from outside | Port 80 not open in the Lightsail firewall |
