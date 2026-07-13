#!/usr/bin/env bash
#
# vbd.sh — one entrypoint for every VerticalBusinessDesigner (VBD) CLI task.
#
# VBD is the "Business Compiler": describe a vertical business → an LLM derives a formal model →
# deterministic validators check it → it renders as a Capability Map → codegen projects it to a
# complete, runnable multi-backend system. This script wraps the whole lifecycle so you never have
# to remember the underlying npm / node / docker incantations.
#
#   ./vbd.sh <command> [args]        Run a command.
#   ./vbd.sh help                    Show every command (this list).
#   ./vbd.sh doctor                  Check your environment is ready.
#
# The commands fall into three groups:
#   • Designer   — run and develop VBD itself (the web app + the key-holding service).
#   • Model      — generate the full system from a business model (the codegen exporter).
#   • App        — build / run / tear down a GENERATED system (docker compose + its Makefile).
#
# Nothing here is magic: every command prints the underlying invocation it runs.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# ── output helpers (colour only on a TTY) ──────────────────────────────────────────────────────
if [ -t 1 ]; then B=$'\033[1m'; DIM=$'\033[2m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; C=$'\033[36m'; N=$'\033[0m'; else B=; DIM=; G=; Y=; R=; C=; N=; fi
say()  { printf "%s\n" "${B}${C}▸${N} ${B}$*${N}"; }
run()  { printf "%s\n" "${DIM}\$ $*${N}"; "$@"; }
ok()   { printf "%s\n" "${G}✓${N} $*"; }
warn() { printf "%s\n" "${Y}!${N} $*"; }
die()  { printf "%s\n" "${R}✗ $*${N}" >&2; exit 1; }

WEB_PORT=5188
SERVICE_PORT=8787
EXPORT_DIR_DEFAULT="$ROOT/out/targets"
EXPORTER="packages/codegen/bin/export-targets.mjs"

usage() {
  cat <<EOF
${B}vbd.sh${N} — VerticalBusinessDesigner command helper

${B}Usage:${N} ./vbd.sh <command> [args]

${B}Getting started${N}
  ${C}install${N}              Install dependencies (links the npm workspaces; offline).
  ${C}doctor${N}               Check the environment (node, .env + key, docker, git).

${B}Designer — run & develop VBD${N}
  ${C}dev${N}                  Run the service (:$SERVICE_PORT) AND the web app (:$WEB_PORT) together. Ctrl-C stops both.
  ${C}web${N}                  Run only the web app       → http://localhost:$WEB_PORT
  ${C}service${N}              Run only the API service   → http://localhost:$SERVICE_PORT  (holds the Anthropic key)
  ${C}test${N}                 Run the package test suite (node --test).
  ${C}build${N}                Production-build the web app.
  ${C}typecheck${N}            Type-check with tsc (via npx; @types are intentionally not vendored).
  ${C}check${N}                The pre-commit gate: ${B}test + build${N} (what CLAUDE.md requires before a commit).
  ${C}prompts${N}              Rebuild the bundled LLM prompts (packages/skills).

${B}Model — generate a system from a business model${N}
  ${C}export${N} [flags]       Project the model → a complete multi-backend repo in ./out/targets.
                       Flags are passed straight through to the exporter. Common ones:
                         --sqlite                embedded SQLite store (single-container app)
                         --enrich [depth]        thicken the model first (conservative|standard|exhaustive)
                         --model <path>          a model.json (default: the baked solar example)
                         --out   <dir>           output directory (default: ./out/targets)
                         --since <old-model>     emit an incremental migration vs a deployed model
                         --no-git                skip the initial git commit in the output
                       Examples:
                         ./vbd.sh export
                         ./vbd.sh export --sqlite --enrich standard
                         ./vbd.sh export --model ./my-business.json --out ./build

${B}App — run a GENERATED system${N}   (operates on ./out/targets, or a dir you pass)
  ${C}app:up${N}   [dir]       docker compose up -d + apply the schema (Postgres/SQLite + n8n + Odoo + spine + UI).
  ${C}app:down${N} [dir]       Tear the stack down.
  ${C}app:ui${N}   [dir]       Run the generated UI on the host (Vite dev server, live reload).
  ${C}app:spine${N} [dir]      Run the generated command API on the host.
  ${C}app:logs${N} [dir]       Follow the docker compose logs.

${B}Verify sandbox${N}
  ${C}verify:up${N}            Build + start the Docker verifier (lets the app build/run/smoke-test generated apps).

Run ${C}./vbd.sh doctor${N} first if anything misbehaves.
EOF
}

# Ensure a generated system exists at \$1 (default out/targets) before app:* commands.
app_dir() {
  local d="${1:-$EXPORT_DIR_DEFAULT}"
  [ -f "$d/docker-compose.yml" ] || die "no generated system at ${d} — run ${B}./vbd.sh export${N} first (or pass a dir)."
  printf "%s" "$d"
}

cmd="${1:-help}"; [ $# -gt 0 ] && shift || true

case "$cmd" in
  install)
    say "installing dependencies (workspace links)"
    run npm install
    ok "done — next: ./vbd.sh doctor, then ./vbd.sh dev"
    ;;

  doctor)
    say "environment check"
    if command -v node >/dev/null; then
      v="$(node -v)"; major="${v#v}"; major="${major%%.*}"
      if [ "$major" -ge 20 ] 2>/dev/null; then ok "node $v"; else warn "node $v (need ≥ 20)"; fi
    else warn "node not found (need ≥ 20)"; fi
    command -v npm >/dev/null && ok "npm $(npm -v)" || warn "npm not found"
    if [ -f .env ]; then
      if grep -Eq '^VBD_ANTHROPIC_API_KEY=sk-' .env; then ok ".env: VBD_ANTHROPIC_API_KEY set"; else warn ".env present but VBD_ANTHROPIC_API_KEY not set — LLM features are disabled (mock still works)"; fi
    else warn "no .env — copy .env.example → .env and set VBD_ANTHROPIC_API_KEY for real LLM generation"; fi
    command -v docker >/dev/null && ok "docker $(docker --version | sed 's/,.*//')" || warn "docker not found (needed for app:up / verify:up)"
    command -v git >/dev/null && ok "git $(git --version | awk '{print $3}')" || warn "git not found (generated exports won't get an initial commit)"
    [ -d node_modules ] && ok "dependencies installed" || warn "node_modules missing — run ./vbd.sh install"
    ;;

  dev)
    say "starting service (:$SERVICE_PORT) + web (:$WEB_PORT) — Ctrl-C stops both"
    npm run dev --workspace @vbd/service & S=$!
    npm run dev --workspace @vbd/web & W=$!
    trap 'kill "$S" "$W" 2>/dev/null || true' INT TERM
    wait
    ;;

  web)      say "web app → http://localhost:$WEB_PORT";        run npm run dev --workspace @vbd/web ;;
  service)  say "API service → http://localhost:$SERVICE_PORT (loads root .env)"; run npm run dev --workspace @vbd/service ;;
  test)     say "package test suite";                          run npm test ;;
  build)    say "building the web app";                        run npm run build --workspace @vbd/web ;;
  typecheck) say "type-checking (npx tsc)";                    run npm run typecheck ;;
  prompts)  say "rebuilding LLM prompts";                      run npm run prompts:build ;;

  check)
    say "pre-commit gate: test + web build"
    run npm test
    run npm run build --workspace @vbd/web
    ok "green — safe to commit"
    ;;

  export)
    say "projecting the model → a complete multi-backend system"
    run node "$EXPORTER" "$@"
    ok "exported. Inspect it, then: ./vbd.sh app:up   (or read out/targets/README.md)"
    ;;

  app:up)
    d="$(app_dir "${1:-}")"
    say "bringing up the generated stack in ${d}"
    ( cd "$d" && run make up && run make db )
    ok "up — UI :8080 · spine :3000 · n8n :5678 · Odoo :8069   (./vbd.sh app:logs to watch)"
    ;;
  app:down) d="$(app_dir "${1:-}")"; say "tearing down ${d}"; ( cd "$d" && run make down ) ;;
  app:ui)   d="$(app_dir "${1:-}")"; say "generated UI (host dev server)"; ( cd "$d" && run make ui ) ;;
  app:spine) d="$(app_dir "${1:-}")"; say "generated command API (host)"; ( cd "$d" && run make spine ) ;;
  app:logs) d="$(app_dir "${1:-}")"; ( cd "$d" && run docker compose logs -f ) ;;

  verify:up)
    say "starting the Docker verifier sandbox"
    [ -f verifier/run.sh ] || die "verifier/run.sh not found"
    run bash verifier/run.sh "$@"
    ;;

  help|-h|--help|"") usage ;;
  *) printf "%s\n" "${R}✗ unknown command: ${cmd}${N}" >&2; echo; usage; exit 1 ;;
esac
