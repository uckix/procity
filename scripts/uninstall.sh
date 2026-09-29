#!/usr/bin/env bash
# PROCity uninstaller — removes the venv, node_modules, build output, launcher.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
say() { printf '\033[36m[procity]\033[0m %s\n' "$*"; }

say "Removing backend virtual environment…"
rm -rf "$ROOT"/backend/.venv*
rm -rf "$ROOT/.pytest_cache"

rm -rf "$ROOT/backend/__pycache__" "$ROOT/backend/tests/__pycache__" "$ROOT/backend/.pytest_cache"

say "Removing frontend build dependencies (the prebuilt UI in frontend/dist is kept)…"
rm -rf "$ROOT/frontend/node_modules"

say "Removing launcher…"
rm -f "$HOME/.local/bin/procity"
rm -f "${XDG_DATA_HOME:-$HOME/.local/share}/applications/procity.desktop"
rm -rf "${XDG_CACHE_HOME:-$HOME/.cache}/procity"

say "PROCity uninstalled. Source files were left in $ROOT"
