#!/usr/bin/env bash
# Scraper logs without systemd's date/host/pid prefix. Follows by default; extra args go to journalctl
# (e.g. `bash deploy/logs.sh -n 100 --no-pager`, `bash deploy/logs.sh --since "10 min ago"`).
exec journalctl -u skyscanner -o cat "${@:--f}"
