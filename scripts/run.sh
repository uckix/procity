#!/usr/bin/env bash
# PROCity launcher — starts the backend, opens an app window, cleans up on exit.
#
# Usage:
#   procity [options]
#
# Options:
#   --demo                 serve synthetic demo data
#   -p, --port <port>      port to bind to (default: 8901)
#   -i, --interval <sec>   monitoring interval seconds (default: 1.0)
#   -m, --max <num>        max processes displayed (default: 1000)
#   --no-browser           run in server-only mode (don't open a browser window)
#   -h, --help             show this help message
set -euo pipefail

# Resolve symlinks: install.sh links this script into ~/.local/bin/procity.
ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.." && pwd)"
BACKEND="$ROOT/backend"

PORT="${PROCITY_PORT:-8901}"
INTERVAL="${PROCITY_INTERVAL:-1.0}"
MAX_PROC="${PROCITY_MAX:-1000}"
DEMO=0
NO_BROWSER=0

while [ $# -gt 0 ]; do
  case "$1" in
    --demo)
      DEMO=1
      shift
      ;;
    -p|--port)
      [ $# -ge 2 ] || { echo "Error: $1 requires an argument" >&2; exit 1; }
      PORT="$2"
      shift 2
      ;;
    -i|--interval)
      [ $# -ge 2 ] || { echo "Error: $1 requires an argument" >&2; exit 1; }
      INTERVAL="$2"
      shift 2
      ;;
    -m|--max)
      [ $# -ge 2 ] || { echo "Error: $1 requires an argument" >&2; exit 1; }
      MAX_PROC="$2"
      shift 2
      ;;
    --no-browser)
      NO_BROWSER=1
      shift
      ;;
    -h|--help)
      sed -n '3,13p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $1 (run with --help for usage)" >&2
      exit 1
      ;;
  esac
done

URL="http://127.0.0.1:$PORT/"

say() { printf '\033[36m[procity]\033[0m %s\n' "$*"; }

# Resilient Python discovery: try venv first, fall back to system python if packages installed
if [ -x "$BACKEND/.venv/bin/python" ]; then
  PYTHON="$BACKEND/.venv/bin/python"
elif python3 -c "import fastapi, uvicorn, psutil, websockets" >/dev/null 2>&1; then
  PYTHON="$(command -v python3)"
else
  echo "Backend dependencies missing. Run scripts/install.sh first." >&2
  exit 1
fi

if [ ! -f "$ROOT/frontend/dist/index.html" ]; then
  echo "Frontend build missing. Run scripts/install.sh (or: cd frontend && npm run build)." >&2
  exit 1
fi

healthy() { # no curl dependency: use python
  "$PYTHON" -c "import urllib.request,sys; urllib.request.urlopen('http://127.0.0.1:$PORT/api/health', timeout=1)" 2>/dev/null
}

if healthy; then
  echo "Port $PORT is already serving PROCity (another instance running?)." >&2
  echo "Stop it first, or pick another port: procity --port 8902" >&2
  exit 1
fi

say "Starting backend on 127.0.0.1:$PORT …"
env PROCITY_PORT="$PORT" PROCITY_INTERVAL="$INTERVAL" PROCITY_MAX="$MAX_PROC" PROCITY_DEMO="$DEMO" \
  "$PYTHON" -m uvicorn main:app \
  --app-dir "$BACKEND" --host 127.0.0.1 --port "$PORT" --log-level warning &
BACKEND_PID=$!
BROWSER_PID=""

cleanup() {
  trap - EXIT INT TERM
  [ -n "$BROWSER_PID" ] && kill "$BROWSER_PID" 2>/dev/null || true
  kill "$BACKEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" 2>/dev/null || true
  say "PROCity stopped."
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# Wait for the API to come up.
for i in $(seq 1 60); do
  if healthy; then break; fi
  kill -0 "$BACKEND_PID" 2>/dev/null || break
  sleep 0.25
done
if ! healthy; then
  echo "Backend failed to start." >&2; exit 1
fi
say "Backend ready at $URL"

if [ "$NO_BROWSER" -eq 1 ]; then
  say "Server running in headless mode. Serving at $URL"
  say "Press Ctrl+C to stop PROCity."
  wait "$BACKEND_PID"
  exit 0
fi

# Open a standalone app window (no tabs / browser chrome). A dedicated profile
# gives a separate browser process, so closing the window stops PROCity
# instead of the URL being handed to an already-running browser.
PROFILE="${XDG_CACHE_HOME:-$HOME/.cache}/procity/browser-profile"
for b in chromium chromium-browser google-chrome-stable google-chrome brave brave-browser vivaldi-stable vivaldi microsoft-edge-stable; do
  if command -v "$b" >/dev/null 2>&1; then
    mkdir -p "$PROFILE"
    "$b" --app="$URL" --user-data-dir="$PROFILE" --class=PROCity \
      --ozone-platform-hint=auto --no-first-run --no-default-browser-check >/dev/null 2>&1 &
    BROWSER_PID=$!
    say "Opened app window with $b."
    break
  fi
done
if [ -z "$BROWSER_PID" ]; then
  if command -v firefox >/dev/null 2>&1; then
    firefox --new-window "$URL" >/dev/null 2>&1 &
    BROWSER_PID=$!
    say "Opened window with firefox (no kiosk mode available)."
  else
    command -v xdg-open >/dev/null 2>&1 && { xdg-open "$URL" >/dev/null 2>&1 & BROWSER_PID=$!; say "Opened default browser."; } || true
  fi
fi

if [ -n "$BROWSER_PID" ]; then
  sleep 3
  if ! kill -0 "$BROWSER_PID" 2>/dev/null; then
    say "Browser handed off to an existing instance — PROCity keeps running here."
    say "Press Ctrl+C to stop PROCity."
    wait
  else
    say "PROCity running. Close the app window (or press Ctrl+C here) to stop."
    wait "$BROWSER_PID"
  fi
else
  say "No browser found — PROCity is serving at $URL"
  say "Press Ctrl+C to stop PROCity."
  wait "$BACKEND_PID"
fi
