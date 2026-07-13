# Add a Next.js UI engine 🟡

**Labels:** `good first issue`, `new-engine`
**Capability role:** `serve-ui`
**Difficulty:** intermediate — mirror the shadcn/ui engine, different framework.
**Reference to copy:** `packages/codegen/src/engines/shadcn.ts` (+ `shadcnAdapter`).

## Why

Today the only `serve-ui` engine is a Vite + React + shadcn/ui scaffold. Many teams standardise on
**Next.js** (App Router, server components, one deploy target on Vercel). A Next.js UI engine lets a
generated system ship a front-end in the stack those teams already use — chosen simply by binding
`serve-ui` to `nextjs`.

## What to build

An engine that provides `serve-ui: "native"` and emits a runnable Next.js app projected from the same
UI structure the shadcn engine already derives (`uiStructure(...)` in `packages/codegen/src/ui.ts` —
reuse it; don't re-derive screens).

1. **`packages/codegen/src/engines/nextjs.ts`** — an `EngineAdapter`:

   ```ts
   export const nextjsEngineAdapter: EngineAdapter = {
     engine: {
       id: "nextjs", name: "Next.js (App Router)", reach: "http",
       provides: { "serve-ui": "native", store: "none", operate: "none", emit: "none",
                   react: "none", sequence: "none", authorize: "none" },
     },
     applies: (ctx) => ctx.binding.defaults["serve-ui"] === "nextjs",
     generate: (ctx) => ({ files: buildNextApp(ctx) }), // ui/… file map
   };
   ```

2. **`buildNextApp(ctx)`** — return a `Record<path, content>` under `ui/` with:
   - `package.json` (next, react, react-dom), `next.config.mjs`, `tsconfig.json`, `app/layout.tsx`,
     `app/globals.css` (map the model's `Theme` tokens to CSS variables, like the shadcn engine does).
   - One route group per business area, one `app/<entity>/page.tsx` (list) + `app/<entity>/[id]/page.tsx`
     (detail) per entity — reuse `uiStructure(caps, domain, contexts)` for screens/fields/relations.
   - Keep data-fetching as clearly-marked `// TODO: fetch from the spine` stubs (same honesty as the
     shadcn engine — the UI doesn't invent an API contract).
   - A theme + i18n hook-up consistent with the shadcn engine where practical.

3. **Register** it in `engines/index.ts`.

4. **Test** `packages/codegen/test/engine-nextjs.test.ts` — assert a `serve-ui: nextjs` binding emits a
   `ui/package.json` depending on `next`, an `app/layout.tsx`, and a list+detail route per entity.

## Acceptance criteria

- Tests green.
- The emitted `ui/` builds: `cd ui && npm install && npm run build` succeeds (paste the output).
- Screen structure matches the model (one list + detail per entity, grouped by area).
- No `node:*` in `engines/nextjs.ts`.
- Conventional Commit, e.g. `feat(engines): add Next.js serve-ui engine`.

## Out of scope

Wiring real data fetches to the spine, auth, and SSR data loading — leave them as TODO stubs (a
follow-up once the UI↔spine contract is generated).
