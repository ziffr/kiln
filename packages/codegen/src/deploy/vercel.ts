/**
 * VERCEL — the UI static-host target (SPEC-012). The generated UI already ships `ui/vercel.json` (Vite +
 * SPA fallback), so this target adds no file; it contributes the reach env (`VITE_API_URL`, the deployed
 * spine URL the UI fetches from) and a PLACEMENT.md row. Hosts the `shadcn` engine only. Managed = Vercel's
 * cloud; selfhost = the same static build on your own CDN. The UI is stateless, so nothing is pruned from
 * compose beyond the local `ui` service, which the operator simply doesn't run when it's on Vercel.
 */
import type { DeployTarget } from "./registry.ts";

export const VERCEL: DeployTarget = {
  id: "vercel",
  name: "Vercel",
  modes: ["managed", "selfhost"],
  hosts: (ctx) => ctx.engineId === "shadcn",
  generate: (ctx) => ({
    prunesComposeService: [ctx.composeService],
    env: { VITE_API_URL: `# VITE_API_URL=   # UI (Vercel) → your deployed spine URL (build-time)` },
    reach: "`cd ui && pnpm build` → Vercel (root dir `ui`); set `VITE_API_URL` to the spine URL.",
  }),
};
