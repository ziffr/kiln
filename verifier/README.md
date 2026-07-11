# VBD app verifier — sandboxed build-and-run

Proves a generated VBD app is **real**: it boots the SQLite server and exercises its API, transform-checks every client file, and builds the client — all inside an **isolated container**, returning a JSON verdict. This is the tier above "does it compile": *does the whole app build and run?*

It runs untrusted, LLM-generated code, so it must stay sandboxed (see **Security**).

## Pieces
- `runner.mjs` — runs **inside** the container against the app at `/work`; prints the verdict. (Logic proven standalone — boots the server, POSTs a record, checks persistence, runs a command, transform-checks the client.)
- `Dockerfile` + `entrypoint.sh` — the sandbox image (Node 22, esbuild + react/vite baked for offline builds, non-root).
- `service.mjs` — the host service: accepts a file map, writes it to an ephemeral temp dir, runs the container with hard isolation, returns the verdict.
- `probe.mjs` — generates a real solar app and either writes `./sample-app/` or POSTs it to the service.

## Prove it locally — one command (Docker Desktop running)
```bash
bash verifier/run.sh
```
That's it. `run.sh` is fully automated: it creates `verifier/.env` with a fresh `VERIFY_SECRET`, wires `VBD_VERIFY_URL` + `VBD_VERIFY_SECRET` into the repo-root `.env` so VBD can reach it, **builds the Docker image if it's missing**, and starts the service on `http://localhost:8900`. No manual Docker.

Then in the app: open **View code → 🧪 Verify app**. Or from the CLI:
```bash
cd verifier && npm run probe        # generates a real app, POSTs /verify, prints the verdict
```
Expected verdict: `{ "ok": true, "checks": [ server:boot, server:create, server:persist, server:command, client:transform, client:build ] }`.

## Move to a VPS (same command, one env change)
1. On the VPS (Ubuntu 22.04+, Docker installed): `git clone` this repo, then `bash verifier/run.sh` (behind Caddy/nginx TLS on a subdomain).
2. In the repo-root `.env` **where VBD runs** (or the Vercel env), set `VBD_VERIFY_URL=https://verify.yourdomain` and `VBD_VERIFY_SECRET=<that box's VERIFY_SECRET>`.
3. Nothing else changes — the image, runner and service are identical local↔remote.

## Security model (do not skip)
The container is run `--network none` (no exfiltration/callbacks), `--memory 512m --cpus 1 --pids-limit 256` (no resource exhaustion), `--read-only` root + a `/tmp` tmpfs, `--security-opt no-new-privileges`, non-root `USER node`, `--rm` (ephemeral), and a wall-clock timeout. The host service only orchestrates Docker; it never executes app code itself, validates paths before writing, and requires a shared secret when `VERIFY_SECRET` is set.
- For stronger isolation on a shared VPS, run under **gVisor** (`--runtime=runsc`) or Firecracker microVMs, or use a managed sandbox (Cloudflare Sandbox SDK, E2B, Fly Machines, Modal).
- Keep the VPS firewall to HTTPS-only; never put real secrets/keys on the verifier box — it needs none.

## VBD integration (built)
- `apps/service` exposes `POST /api/verify` and a Vercel `verify` function — both forward `{files}` to `VBD_VERIFY_URL/verify` with the `x-verify-secret` header (env-based; returns `{configured:false}` when unset).
- The **View code → 🧪 Verify app** button generates the current app (incl. any AI handlers/screens), POSTs it, and shows the verdict per check.
- All config is variable-based, so local↔VPS cut-over is only the two `VBD_VERIFY_*` values.
