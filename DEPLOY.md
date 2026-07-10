# Deploying VBD to Vercel

The web app ships as a static SPA; the service becomes stateless serverless functions under
`apps/web/api/*`. The Anthropic key stays server-side (a Vercel env var) — it never reaches the
browser (golden invariant #3).

## One-time import (Vercel dashboard)

1. **Vercel → Add New → Project → Import** `ziffr/vertical-business-designer`.
2. **Root Directory:** set to **`apps/web`** (the ⚙️ "Edit" next to Root Directory). This is the
   Vite app; Vercel installs the npm workspaces from the repo root automatically.
3. **Framework Preset:** Vite (auto-detected). Build/Output are taken from `apps/web/vercel.json`
   (`npm run build` → `dist`).
4. **Environment Variables → add:**
   - `VBD_ANTHROPIC_API_KEY` = `sk-ant-…` (your Anthropic key). Server-side only — do **not** prefix
     it with `VITE_`, or it would be bundled into the browser.
5. **Deploy.**

Without the key the app still runs in **mock/offline mode** (all layers work deterministically);
the LLM buttons return a "key not set" error until the env var is added, then **Redeploy**.

## What runs where

| Path | Runtime |
|---|---|
| `/` (the SPA) | static `apps/web/dist` |
| `/api/models,generate,domain,contexts,events,coach,usage` | serverless functions (`apps/web/api`), hold the key |
| projects persistence | **localStorage** in the browser (the filesystem store isn't deployed) |

## Local dev (unchanged)

```
npm run dev --workspace @vbd/web       # http://localhost:5188
npm run dev --workspace @vbd/service   # http://localhost:8787 (loads root .env)
```
`SERVICE_URL` (apps/web/src/config.ts) points at `:8787` in dev and same-origin `/api` in prod;
override with `VITE_SERVICE_URL` if needed.

## Notes

- `maxDuration` is 60s (`apps/web/vercel.json`); the behaviour endpoint fans out per entity
  **concurrently** to stay within it. On heavier domains, raise it (Pro allows up to 300s).
- If the build fails, check Vercel's build logs — the usual monorepo fix is confirming Root Directory
  is `apps/web` so the workspace install resolves the `@vbd/*` packages.
