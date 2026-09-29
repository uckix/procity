#!/usr/bin/env bash
# PROCity installer for Debian/Ubuntu, Arch, Fedora and openSUSE.
#
#   scripts/install.sh              install (Python only; uses the prebuilt UI)
#   scripts/install.sh --deps       also install missing system packages (sudo)
#   scripts/install.sh --build      rebuild the UI from source (needs Node >= 20.19)
#   scripts/install.sh --dev        also install development dependencies (pytest)
#   scripts/install.sh --no-launcher  skip ~/.local/bin + app-menu entry
#
# Never modifies system configuration; sudo is only used with --deps.
set -euo pipefail

ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
DIST="$FRONTEND/dist"
PY_MIN="3.10"
NODE_MIN="20.19"

say()  { printf '\033[36m[procity]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[procity]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m[procity]\033[0m %s\n' "$*" >&2; exit 1; }

if [ -n "${SUDO_USER:-}" ] && [ "$(id -u)" -eq 0 ]; then
  warn "Warning: scripts/install.sh was invoked with sudo."
  warn "This can create root-owned files in your workspace."
  warn "Tip: Run as normal user; '--deps' invokes sudo only when installing packages."
fi

WANT_DEPS=0 WANT_BUILD=0 WANT_LAUNCHER=1 WANT_DEV=0
for arg in "$@"; do
  case "$arg" in
    --deps) WANT_DEPS=1 ;;
    --build) WANT_BUILD=1 ;;
    --dev) WANT_DEV=1 ;;
    --no-launcher) WANT_LAUNCHER=0 ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Unknown option: $arg (see --help)" ;;
  esac
done

# ---------------------------------------------------------------- distro ---
FAMILY=unknown
if [ -r /etc/os-release ]; then
  . /etc/os-release
  case " ${ID:-} ${ID_LIKE:-} " in
    *" debian "*|*" ubuntu "*) FAMILY=debian ;;
    *" arch "*) FAMILY=arch ;;
    *" fedora "*|*" rhel "*) FAMILY=fedora ;;
    *" suse "*|*" opensuse "*) FAMILY=suse ;;
  esac
  say "Detected ${PRETTY_NAME:-$ID} ($FAMILY family)."
fi

pkg_install() { # pkg_install <debian pkgs> <arch pkgs> <fedora pkgs> <suse pkgs>
  local cmd
  case "$FAMILY" in
    debian) cmd="sudo apt-get install -y $1" ;;
    arch)   cmd="sudo pacman -S --needed --noconfirm $2" ;;
    fedora) cmd="sudo dnf install -y $3" ;;
    suse)   cmd="sudo zypper install -y $4" ;;
    *) return 1 ;;
  esac
  if [ "$WANT_DEPS" -eq 1 ]; then
    say "Running: $cmd"
    [ "$FAMILY" = debian ] && sudo apt-get update -qq
    eval "$cmd"
  else
    echo "    $cmd"
    return 1
  fi
}

version_ge() { # version_ge <have> <need>
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]
}

# ---------------------------------------------------------------- python ---
python_ok() {
  command -v python3 >/dev/null 2>&1 &&
    python3 -c "import sys; sys.exit(sys.version_info < (${PY_MIN/./, }))" 2>/dev/null &&
    python3 -c "import venv, ensurepip" 2>/dev/null
}
if ! python_ok; then
  warn "Python >= $PY_MIN with the venv module is required. Install it with:"
  pkg_install "python3 python3-venv" "python" "python3" "python3" ||
    die "Install Python first (or re-run with --deps), then run scripts/install.sh again."
  python_ok || die "Python >= $PY_MIN with venv still not available."
fi
say "Python $(python3 -c 'import platform; print(platform.python_version())') OK."

# -------------------------------------------------------------- frontend ---
node_ok() {
  command -v node >/dev/null 2>&1 &&
    (command -v npm >/dev/null 2>&1 || command -v pnpm >/dev/null 2>&1) &&
    version_ge "$(node --version | tr -d v)" "$NODE_MIN"
}

build_frontend() {
  say "Building the UI from source with Node $(node --version)…"
  if command -v pnpm >/dev/null 2>&1; then
    (cd "$FRONTEND" && pnpm install && pnpm run build)
  else
    (cd "$FRONTEND" && npm ci --no-fund --no-audit && npm run build)
  fi
}

download_prebuilt() {
  # Works for clones of a GitHub repo that publishes releases (see .github/workflows/release.yml).
  local remote slug url
  remote="$(git -C "$ROOT" remote get-url origin 2>/dev/null || true)"
  slug="$(printf '%s' "$remote" | sed -nE 's#^(https://github\.com/|git@github\.com:)([^/]+/[^/.]+)(\.git)?/?$#\2#p')"
  [ -n "$slug" ] || return 1
  url="https://github.com/$slug/releases/latest/download/procity-web.tar.gz"
  say "Downloading prebuilt UI from $url …"
  python3 - "$url" "$FRONTEND" <<'EOF' || return 1
import io, sys, tarfile, urllib.request
data = urllib.request.urlopen(sys.argv[1], timeout=60).read()
with tarfile.open(fileobj=io.BytesIO(data)) as tf:
    tf.extractall(sys.argv[2], filter="data") if hasattr(tarfile, "data_filter") else tf.extractall(sys.argv[2])
EOF
  [ -f "$DIST/index.html" ]
}

if [ "$WANT_BUILD" -eq 1 ]; then
  if ! node_ok; then
    warn "--build needs Node.js >= $NODE_MIN and npm/pnpm."
    pkg_install "nodejs npm" "nodejs npm" "nodejs npm" "nodejs npm" || true
    node_ok || die "Node.js >= $NODE_MIN not available. Your distro's package may be too old; see https://nodejs.org/en/download (or use nvm/mise)."
  fi
  build_frontend
elif [ -f "$DIST/index.html" ]; then
  say "Using the prebuilt UI in frontend/dist (run with --build to rebuild it)."
elif node_ok; then
  build_frontend
elif download_prebuilt; then
  say "Prebuilt UI installed."
else
  die "No prebuilt UI found and Node.js >= $NODE_MIN is not installed.
    Either download a release tarball (it includes the prebuilt UI),
    or install Node.js >= $NODE_MIN and run: scripts/install.sh --build"
fi

# --------------------------------------------------------------- backend ---
say "Creating Python virtual environment…"
python3 -m venv "$BACKEND/.venv"
say "Installing backend dependencies…"
"$BACKEND/.venv/bin/python" -m pip install --quiet --upgrade pip
"$BACKEND/.venv/bin/python" -m pip install --quiet -r "$BACKEND/requirements.txt"
if [ "$WANT_DEV" -eq 1 ]; then
  say "Installing backend development dependencies (pytest, httpx)…"
  "$BACKEND/.venv/bin/python" -m pip install --quiet -r "$BACKEND/requirements-dev.txt"
fi

chmod +x "$ROOT/scripts/"*.sh

# --------------------------------------------------------------- browser ---
BROWSER_FOUND=""
for b in chromium chromium-browser google-chrome-stable google-chrome brave brave-browser vivaldi-stable microsoft-edge-stable firefox; do
  command -v "$b" >/dev/null 2>&1 && { BROWSER_FOUND="$b"; break; }
done
if [ -z "$BROWSER_FOUND" ]; then
  warn "No supported browser found. For a standalone app window install Chromium:"
  pkg_install "chromium" "chromium" "chromium" "chromium" || true
elif [ "$BROWSER_FOUND" = firefox ]; then
  say "Browser: firefox (tip: Chromium gives a borderless app window)."
else
  say "Browser: $BROWSER_FOUND."
fi

# -------------------------------------------------------------- launcher ---
if [ "$WANT_LAUNCHER" -eq 1 ]; then
  BIN_DIR="$HOME/.local/bin"
  APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  mkdir -p "$BIN_DIR" "$APP_DIR"
  ln -sf "$ROOT/scripts/run.sh" "$BIN_DIR/procity"
  cat > "$APP_DIR/procity.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=PROCity
Comment=Live 3D city of your running Linux processes
Exec="$ROOT/scripts/run.sh"
Icon=$ROOT/assets/procity.svg
Terminal=false
Categories=System;Monitor;
Keywords=process;monitor;task;cpu;memory;3d;
EOF
  say "Launcher: ~/.local/bin/procity  +  app-menu entry \"PROCity\"."
  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) warn "$BIN_DIR is not in your PATH; add it, or run $ROOT/scripts/run.sh directly." ;;
  esac
fi

say "Install complete. Start PROCity with:  procity   (or scripts/run.sh)"
say "Demo mode (synthetic data):          procity --demo"
