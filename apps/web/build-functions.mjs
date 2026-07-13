/**
 * Bundle the serverless functions for Vercel — as ONE catch-all function.
 *
 * Vercel's Node runtime transpiles each `.ts` function per-file but does NOT bundle, so it cannot load
 * our pure-TypeScript workspace packages (`@kiln/*`, no build step) at runtime. AND Vercel plans cap the
 * number of Serverless Functions — 25 files (one per endpoint) exceed the cap and error the deploy.
 *
 * So we esbuild the single router (`functions/router.ts`, which imports every handler and dispatches on
 * the path) into ONE self-contained `api/[...path].js` (a Vercel catch-all) with all `@kiln/*` code
 * inlined. `@anthropic-ai/sdk` stays external (a normal npm dep Vercel installs). Runs before `vite build`.
 */

import { build } from "esbuild";
import { mkdirSync, rmSync } from "node:fs";

// Fresh api/ so no stale per-file bundles linger from an older build.
rmSync("api", { recursive: true, force: true });
mkdirSync("api", { recursive: true });

await build({
  // Object form: input `functions/router.ts` → output `api/[...path].js` (the Vercel catch-all name).
  // (Naming the source file with brackets would trip esbuild's entry globbing, so we map it here instead.)
  entryPoints: { "[...path]": "functions/router.ts" },
  outdir: "api",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external: ["@anthropic-ai/sdk"],
  logLevel: "info",
});

console.log("[build-functions] bundled 25 handlers → api/[...path].js (one catch-all function)");
