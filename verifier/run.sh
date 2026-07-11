#!/usr/bin/env bash
# Fully automated: creates .env (+ a fresh secret), builds the Docker image if missing, wires the
# repo-root .env so VBD can reach the verifier, and starts the service. No manual Docker needed.
#
#   bash verifier/run.sh              # first run does everything, then starts the service
#   bash verifier/run.sh --rebuild    # force-rebuild the image
#
# Cut-over to a VPS: run this same script there, then set VBD_VERIFY_URL in the repo-root .env to the
# VPS URL (and VBD_VERIFY_SECRET to that box's VERIFY_SECRET). Nothing else changes.
set -euo pipefail
cd "$(dirname "$0")"

# 1) .env with a generated secret on first run.
if [ ! -f .env ]; then
  cp .env.example .env
  SECRET="$(openssl rand -hex 24)"
  # portable in-place edit (macOS + GNU sed)
  sed -i.bak "s|^VERIFY_SECRET=.*|VERIFY_SECRET=${SECRET}|" .env && rm -f .env.bak
  echo "→ created verifier/.env with a fresh VERIFY_SECRET"
fi

# Load .env into this shell.
set -a; . ./.env; set +a
: "${PORT:=8900}"; : "${VERIFY_IMAGE:=vbd-verifier}"

# 2) Wire the repo-root .env so VBD reaches this verifier (idempotent — only adds if missing).
ROOT_ENV="../.env"
if [ -f "$ROOT_ENV" ] && ! grep -q "^VBD_VERIFY_URL=" "$ROOT_ENV"; then
  {
    echo ""
    echo "# --- app verifier (added by verifier/run.sh) ---"
    echo "VBD_VERIFY_URL=http://localhost:${PORT}"
    echo "VBD_VERIFY_SECRET=${VERIFY_SECRET}"
  } >> "$ROOT_ENV"
  echo "→ wired VBD_VERIFY_URL + VBD_VERIFY_SECRET into repo-root .env"
fi

# 3) Build the image if it's missing (or --rebuild).
if [ "${1:-}" = "--rebuild" ] || ! docker image inspect "$VERIFY_IMAGE" >/dev/null 2>&1; then
  echo "→ building image '$VERIFY_IMAGE' (one-time; needs network for the base image)…"
  docker build -t "$VERIFY_IMAGE" .
fi

# 4) Run the service.
echo "→ starting verifier on http://localhost:${PORT} (auth on)"
exec node --env-file=.env service.mjs
