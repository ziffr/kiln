# VBD app verifier — sandboxed build-and-run

Proves a generated VBD app is **real**: it boots the SQLite server and exercises its API, transform-checks every client file, and builds the client — all inside an **isolated container**, returning a JSON verdict. This is the tier above "does it compile": *does the whole app build and run?*

It runs untrusted, LLM-generated code, so it must stay sandboxed (see **Security**).

## Pieces
- `runner.mjs` — runs **inside** the container against the app at `/work`; prints the verdict. (Logic proven standalone — boots the server, POSTs a record, checks persistence, runs a command, transform-checks the client.)
- `Dockerfile` + `entrypoint.sh` — the sandbox image (Node 22, esbuild + react/vite baked for offline builds, non-root).
- `service.mjs` — the host service: accepts a file map, writes it to an ephemeral temp dir, runs the container with hard isolation, returns the verdict.
- `probe.mjs` — generates a real solar app and either writes `./sample-app/` or POSTs it to the service.

## Prove it locally (Docker Desktop / any local Docker)
```bash
cd verifier
npm run build:image                 # docker build -t vbd-verifier .   (needs network once, for the base image + baked deps)

# A) one-shot, no service — generate a sample app and run the sandbox directly:
npm run sample                      # writes ./sample-app + prints the exact docker run
docker run --rm --network none --memory 512m --cpus 1 -v "$PWD/sample-app:/work" vbd-verifier

# B) via the service (how VBD will call it):
npm run up &                        # verifier on http://localhost:8900
npm run probe                       # generates an app, POSTs /verify, prints the verdict
```
Expected verdict: `{ "ok": true, "checks": [ server:boot, server:create, server:persist, server:command, client:transform, client:build ... ] }`.

## Move to a VPS (same image, one env change)
1. On the VPS (Ubuntu 22.04+, Docker installed): `git clone` this repo, `cd verifier`, `npm run build:image`.
2. Run the service behind a reverse proxy (Caddy/nginx) with TLS, bound to a subdomain:
   ```bash
   VERIFY_SECRET=$(openssl rand -hex 24) PORT=8900 node service.mjs
   ```
3. Point VBD's service/functions at `https://verify.yourdomain/verify` with the `x-verify-secret` header. Nothing else changes — the image and runner are identical to local.

## Security model (do not skip)
The container is run `--network none` (no exfiltration/callbacks), `--memory 512m --cpus 1 --pids-limit 256` (no resource exhaustion), `--read-only` root + a `/tmp` tmpfs, `--security-opt no-new-privileges`, non-root `USER node`, `--rm` (ephemeral), and a wall-clock timeout. The host service only orchestrates Docker; it never executes app code itself, validates paths before writing, and requires a shared secret when `VERIFY_SECRET` is set.
- For stronger isolation on a shared VPS, run under **gVisor** (`--runtime=runsc`) or Firecracker microVMs, or use a managed sandbox (Cloudflare Sandbox SDK, E2B, Fly Machines, Modal).
- Keep the VPS firewall to HTTPS-only; never put real secrets/keys on the verifier box — it needs none.

## Next: wire into VBD
Add a `POST /api/verify` proxy in `apps/service` + a Vercel function that forwards `{files}` (from `generateApp(...)` in the browser) to this service, and a "Verify app" button in the Code panel that shows the verdict — then feed failures into the existing fix loop for a generate → build → run → fix cycle.
