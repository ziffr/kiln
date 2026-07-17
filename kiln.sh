#!/usr/bin/env bash
#
# kiln.sh — one entrypoint for every Kiln CLI task.
#
# Kiln is the "Business Compiler": describe a vertical business → an LLM derives a formal model →
# deterministic validators check it → it renders as a Capability Map → codegen projects it to a
# complete, runnable multi-backend system. This script wraps the whole lifecycle so you never have
# to remember the underlying npm / node / docker incantations.
#
#   ./kiln.sh <command> [args]        Run a command.
#   ./kiln.sh help                    Show every command (this list).
#   ./kiln.sh doctor                  Check your environment is ready.
#
# The commands fall into three groups:
#   • Designer   — run and develop Kiln itself (the web app + the key-holding service).
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
${B}kiln.sh${N} — Kiln command helper

${B}Usage:${N} ./kiln.sh <command> [args]

${B}Getting started${N}
  ${C}install${N}              Install dependencies (links the npm workspaces; offline).
  ${C}doctor${N}               Check the environment (node, .env + key, docker, git).

${B}Designer — run & develop Kiln${N}
  ${C}dev${N}                  Run the service (:$SERVICE_PORT) AND the web app (:$WEB_PORT) together. Ctrl-C stops both.
  ${C}stop${N}                 Stop any running dev processes + free ports :$SERVICE_PORT/:$WEB_PORT (clears stale servers).
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
                         ./kiln.sh export
                         ./kiln.sh export --sqlite --enrich standard
                         ./kiln.sh export --model ./my-business.json --out ./build

${B}App — run a GENERATED system${N}   (operates on ./out/targets, or a dir you pass)
  ${C}app:up${N}   [dir]       docker compose up -d + apply the schema (Postgres/SQLite + n8n + Odoo + spine + UI).
  ${C}app:down${N} [dir]       Tear the stack down.
  ${C}app:ui${N}   [dir]       Run the generated UI on the host (Vite dev server, live reload).
  ${C}app:spine${N} [dir]      Run the generated command API on the host.
  ${C}app:logs${N} [dir]       Follow the docker compose logs.

${B}Alternative AI engines${N}   (optional — Anthropic is the default; OpenRouter needs only a key)
  ${C}omniroute:up${N}         Run the self-hosted omniroute AI gateway as a sidecar (via npx, MIT). Prints next steps.
  ${C}omniroute:down${N}       Stop it.

${B}Connectors — a local Nango${N}   (OPTIONAL convenience; NOT required — see below)
  ${C}nango:up${N}             Boot a local Nango (OAuth broker) via docker compose + print setup steps.
  ${C}nango:down${N}           Stop it.
                       Connectors broker agent OAuth through ${B}Nango${N}. Kiln + every exported app reach
                       whichever Nango you set via ${C}NANGO_HOST${N} + ${C}NANGO_SECRET_KEY${N} — three EQUAL options:
                         1) ${B}Nango Cloud${N}      — nothing to run; use its host + secret key.
                         2) ${B}an existing Nango${N} — your company's instance; point at it.
                         3) ${B}nango:up${N}          — this local helper (convenience only, never mandatory).

${B}Verify sandbox${N}
  ${C}verify:up${N}            Build + start the Docker verifier (lets the app build/run/smoke-test generated apps).

Run ${C}./kiln.sh doctor${N} first if anything misbehaves.
EOF
}

# Ensure a generated system exists at \$1 (default out/targets) before app:* commands.
app_dir() {
  local d="${1:-$EXPORT_DIR_DEFAULT}"
  [ -f "$d/docker-compose.yml" ] || die "no generated system at ${d} — run ${B}./kiln.sh export${N} first (or pass a dir)."
  printf "%s" "$d"
}

# Kill a pid AND all its descendants. `npm run dev` spawns a `node --watch` server as a child, so killing
# only the npm wrapper (its $! pid) orphans the server — it keeps holding its port and the next `dev` can't
# bind, which is how stale processes pile up. Walk the tree so nothing is left behind.
kill_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" 2>/dev/null); do kill_tree "$child"; done
  kill "$pid" 2>/dev/null || true
}

# Kill whatever LISTENs on a TCP port (returns 0 if it killed something). Precise — used by `stop`.
kill_port() {
  local pids; pids="$(lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null || true)"
  [ -n "$pids" ] && { kill $pids 2>/dev/null || true; return 0; } || return 1
}

cmd="${1:-help}"; [ $# -gt 0 ] && shift || true

case "$cmd" in
  install)
    say "installing dependencies (workspace links)"
    run npm install
    ok "done — next: ./kiln.sh doctor, then ./kiln.sh dev"
    ;;

  doctor)
    say "environment check"
    if command -v node >/dev/null; then
      v="$(node -v)"; major="${v#v}"; major="${major%%.*}"
      if [ "$major" -ge 20 ] 2>/dev/null; then ok "node $v"; else warn "node $v (need ≥ 20)"; fi
    else warn "node not found (need ≥ 20)"; fi
    command -v npm >/dev/null && ok "npm $(npm -v)" || warn "npm not found"
    if [ -f .env ]; then
      # Anthropic is the default engine — accept the legacy VBD_ alias too (both are read by the service).
      if grep -Eq '^(KILN|VBD)_ANTHROPIC_API_KEY=.*sk-' .env; then ok ".env: Anthropic key set (default engine)"; else warn ".env present but no Anthropic key (KILN_ANTHROPIC_API_KEY) — real LLM needs an engine (mock still works)"; fi
      # Optional open-source engines — reported when their key has a non-empty value.
      grep -Eq '^KILN_OPENROUTER_API_KEY=.' .env && ok ".env: OpenRouter engine configured" || true
      grep -Eq '^KILN_OMNIROUTE_API_KEY=.'  .env && ok ".env: omniroute engine configured"  || true
    else warn "no .env — copy .env.example → .env and set an engine key (KILN_ANTHROPIC_API_KEY) for real LLM generation"; fi
    command -v docker >/dev/null && ok "docker $(docker --version | sed 's/,.*//')" || warn "docker not found (needed for app:up / verify:up)"
    command -v git >/dev/null && ok "git $(git --version | awk '{print $3}')" || warn "git not found (generated exports won't get an initial commit)"
    [ -d node_modules ] && ok "dependencies installed" || warn "node_modules missing — run ./kiln.sh install"
    # Stale-process guard: >1 service process means an orphaned `dev` is likely squatting on :$SERVICE_PORT,
    # which blocks a fresh service from binding (its engine catalog then looks wrong). `stop` clears them.
    svc="$(pgrep -f 'env-file=../../.env' 2>/dev/null | wc -l | tr -d ' ')"
    if [ "${svc:-0}" -gt 1 ]; then warn "$svc Kiln service processes running (expected ≤ 1) — likely stale; run ${B}./kiln.sh stop${N}"; else ok "no stale service processes"; fi
    ;;

  dev)
    say "starting service (:$SERVICE_PORT) + web (:$WEB_PORT) — Ctrl-C stops both"
    npm run dev --workspace @kiln/service & S=$!
    npm run dev --workspace @kiln/web & W=$!
    # Take down the node --watch servers too, not just the npm wrappers — otherwise a server orphans and
    # keeps holding its port (stale-process pileup). EXIT covers non-signal exits as well.
    trap 'kill_tree "$S"; kill_tree "$W"' INT TERM EXIT
    wait
    ;;

  stop|kill)
    say "stopping Kiln dev processes + freeing ports :$SERVICE_PORT / :$WEB_PORT"
    kill_port "$SERVICE_PORT" && ok "freed :$SERVICE_PORT (service)" || say ":$SERVICE_PORT already free"
    kill_port "$WEB_PORT"     && ok "freed :$WEB_PORT (web)"         || say ":$WEB_PORT already free"
    # Sweep any orphaned service processes that lost their port but keep running (the pileup culprit).
    pkill -f 'env-file=../../.env' 2>/dev/null && ok "cleared orphaned service process(es)" || true
    ok "done — ./kiln.sh dev for a clean start"
    ;;

  web)      say "web app → http://localhost:$WEB_PORT";        run npm run dev --workspace @kiln/web ;;
  service)  say "API service → http://localhost:$SERVICE_PORT (loads root .env)"; run npm run dev --workspace @kiln/service ;;
  test)     say "package test suite";                          run npm test ;;
  build)    say "building the web app";                        run npm run build --workspace @kiln/web ;;
  typecheck) say "type-checking (npx tsc)";                    run npm run typecheck ;;
  prompts)  say "rebuilding LLM prompts";                      run npm run prompts:build ;;

  check)
    say "pre-commit gate: test + web build"
    run npm test
    run npm run build --workspace @kiln/web
    ok "green — safe to commit"
    ;;

  export)
    say "projecting the model → a complete multi-backend system"
    run node "$EXPORTER" "$@"
    ok "exported. Inspect it, then: ./kiln.sh app:up   (or read out/targets/README.md)"
    ;;

  app:up)
    d="$(app_dir "${1:-}")"
    say "bringing up the generated stack in ${d}"
    ( cd "$d" && run make up && run make db )
    ok "up — UI :8080 · spine :3000 · n8n :5678 · Odoo :8069   (./kiln.sh app:logs to watch)"
    ;;
  app:down) d="$(app_dir "${1:-}")"; say "tearing down ${d}"; ( cd "$d" && run make down ) ;;
  app:ui)   d="$(app_dir "${1:-}")"; say "generated UI (host dev server)"; ( cd "$d" && run make ui ) ;;
  app:spine) d="$(app_dir "${1:-}")"; say "generated command API (host)"; ( cd "$d" && run make spine ) ;;
  app:logs) d="$(app_dir "${1:-}")"; ( cd "$d" && run docker compose logs -f ) ;;

  omniroute:up)
    # omniroute (MIT) is a self-hosted, OpenAI-compatible AI gateway — an OPTIONAL alternative engine.
    # It is NOT a Kiln dependency: we run it as a sidecar via npx (no install), Kiln just calls it over HTTP.
    port="${KILN_OMNIROUTE_PORT:-20128}"
    if lsof -ti:"$port" >/dev/null 2>&1; then
      ok "omniroute already running → dashboard http://localhost:$port"
    else
      say "starting omniroute on :$port (first run fetches it via npx — this can take a moment)"
      nohup npx -y omniroute >/tmp/kiln-omniroute.log 2>&1 &
      sleep 3
      lsof -ti:"$port" >/dev/null 2>&1 && ok "omniroute up → dashboard http://localhost:$port  (logs: /tmp/kiln-omniroute.log)" \
        || warn "omniroute may still be starting — check /tmp/kiln-omniroute.log"
    fi
    say "Next: open the dashboard, connect a provider + copy an API key, then add to your ${B}.env${N}:"
    printf "    KILN_OMNIROUTE_API_KEY=<key from the dashboard>\n    # base URL defaults to http://localhost:%s/v1\n" "$port"
    say "Then run ${B}./kiln.sh service${N} and choose omniroute in Studio → Settings → Engine. (Anthropic stays the default.)"
    ;;
  omniroute:down)
    port="${KILN_OMNIROUTE_PORT:-20128}"
    pids="$(lsof -ti:"$port" 2>/dev/null || true)"
    if [ -n "$pids" ]; then run kill $pids; ok "omniroute stopped"; else warn "omniroute not running on :$port"; fi
    ;;

  nango:up)
    # OPTIONAL local Nango — ONE of three equal ways to point Kiln at a Nango (Cloud / existing / this).
    # Self-hosting is never required; this just stands up a local instance for developing connectors.
    NANGO_COMPOSE="tools/nango/docker-compose.yml"
    [ -f "$NANGO_COMPOSE" ] || die "$NANGO_COMPOSE not found"
    command -v docker >/dev/null || die "docker not found — needed for a local Nango (or use Nango Cloud / an existing instance instead)."
    # Nango REQUIRES a base64 32-byte encryption key. Generate one into .env if it isn't set yet, so the
    # local instance's encrypted connection store is stable across restarts (a new key orphans old connections).
    if [ -f .env ] && grep -Eq '^NANGO_ENCRYPTION_KEY=.' .env; then
      ok "NANGO_ENCRYPTION_KEY already set in .env"
    else
      command -v openssl >/dev/null || die "openssl not found — set NANGO_ENCRYPTION_KEY (base64 32 bytes) in .env by hand."
      key="$(openssl rand -base64 32)"
      printf "\n# Local Nango (tools/nango) — the base64 32-byte key encrypting its connection store.\nNANGO_ENCRYPTION_KEY=%s\n" "$key" >> .env
      ok "generated NANGO_ENCRYPTION_KEY → appended to .env"
    fi
    say "booting a local Nango (Postgres + Redis + nango-server) — first run pulls images"
    ( set -a; [ -f .env ] && . ./.env; set +a; run docker compose -f "$NANGO_COMPOSE" up -d )
    ok "Nango up → API http://localhost:3003 · dashboard/Connect UI http://localhost:3009"
    say "Next steps (one-time):"
    printf "  1. Open the dashboard ${B}http://localhost:3009${N} (login: NANGO_DASHBOARD_USERNAME/PASSWORD, default admin/admin).\n"
    printf "  2. Create a ${B}Google Sheets${N} integration (add your Google OAuth client id/secret + scopes).\n"
    printf "  3. Copy the environment's ${B}Secret Key${N} from Settings, then add to your ${B}.env${N}:\n"
    printf "       ${C}NANGO_SECRET_KEY=<secret key from the dashboard>${N}\n"
    printf "       ${C}NANGO_HOST=http://localhost:3003${N}\n"
    printf "       ${C}NANGO_PROVIDER_CONFIG_KEY=google-sheets${N}   # the integration id you created\n"
    say "Then: grant + connect in Studio (Agents → Tools), or in an exported app's Connect panel. ${DIM}(This local Nango is optional — Nango Cloud or an existing instance work identically.)${N}"
    ;;
  nango:down)
    NANGO_COMPOSE="tools/nango/docker-compose.yml"
    [ -f "$NANGO_COMPOSE" ] || die "$NANGO_COMPOSE not found"
    say "stopping the local Nango"
    ( set -a; [ -f .env ] && . ./.env; set +a; run docker compose -f "$NANGO_COMPOSE" down )
    ok "Nango stopped (volumes kept — ./kiln.sh nango:down does not delete connections; add 'docker compose -f $NANGO_COMPOSE down -v' to wipe them)"
    ;;

  verify:up)
    say "starting the Docker verifier sandbox"
    [ -f verifier/run.sh ] || die "verifier/run.sh not found"
    run bash verifier/run.sh "$@"
    ;;

  help|-h|--help|"") usage ;;
  *) printf "%s\n" "${R}✗ unknown command: ${cmd}${N}" >&2; echo; usage; exit 1 ;;
esac
