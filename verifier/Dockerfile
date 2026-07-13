# The sandbox image: verifies a generated Kiln app (boot server + probe API + transform + build).
# Untrusted, LLM-generated code runs here — the container is run with --network none, resource
# limits, a read-only root fs and a non-root user (see service.mjs / README).
FROM node:22-slim

# Runner deps (esbuild for the transform-check) — baked at build time when network is available.
WORKDIR /runner
RUN npm init -y >/dev/null 2>&1 && npm install --no-audit --no-fund --loglevel=error esbuild@^0.20

# Client build deps (react/vite) baked once, so the generated client can `vite build` OFFLINE.
WORKDIR /deps
RUN npm init -y >/dev/null 2>&1 && npm install --no-audit --no-fund --loglevel=error \
      react@^18.2.0 react-dom@^18.2.0 vite@^5.0.0 @vitejs/plugin-react@^4.2.0

COPY runner.mjs /runner/runner.mjs
COPY entrypoint.sh /runner/entrypoint.sh
RUN chmod +x /runner/entrypoint.sh

USER node
ENTRYPOINT ["/runner/entrypoint.sh"]
