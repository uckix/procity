#!/usr/bin/env bash
# Build release archives into release/ (needs Node >= 20.19 for the UI build):
#   procity-<version>.tar.gz   full app incl. prebuilt UI — users only need Python
#   procity-web.tar.gz         just the prebuilt UI (install.sh can download it)
set -euo pipefail

ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.." && pwd)"
VERSION="$(sed -nE 's/^ *"version": *"([^"]+)".*/\1/p' "$ROOT/frontend/package.json" | head -1)"
NAME="procity-$VERSION"
OUT="$ROOT/release"

if command -v pnpm >/dev/null 2>&1; then
  (cd "$ROOT/frontend" && pnpm install && pnpm run build)
else
  (cd "$ROOT/frontend" && npm ci --no-fund --no-audit && npm run build)
fi


rm -rf "$OUT" && mkdir -p "$OUT"
tar -czf "$OUT/procity-web.tar.gz" -C "$ROOT/frontend" dist

# Full app: tracked files (when in git) plus the freshly built UI.
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/$NAME"
if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git -C "$ROOT" ls-files -z | (cd "$ROOT" && xargs -0 cp --parents -t "$STAGE/$NAME")
else
  tar -C "$ROOT" --exclude=.git --exclude=node_modules --exclude=.venv --exclude=release \
      --exclude=__pycache__ --exclude=.pytest_cache -cf - . | tar -C "$STAGE/$NAME" -xf -
fi
rm -rf "$STAGE/$NAME/frontend/dist"
cp -r "$ROOT/frontend/dist" "$STAGE/$NAME/frontend/dist"
tar -czf "$OUT/$NAME.tar.gz" -C "$STAGE" "$NAME"

(cd "$OUT" && sha256sum ./*.tar.gz > SHA256SUMS)
echo "Release archives:"; ls -lh "$OUT"
