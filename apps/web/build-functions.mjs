/**
 * Bundle the serverless functions for Vercel.
 *
 * Vercel's Node runtime transpiles each `.ts` function per-file but does NOT bundle, so it cannot
 * load our pure-TypeScript workspace packages (`@kiln/*`, which have no build step) at runtime. We
 * esbuild each `functions/<name>.ts` into a SELF-CONTAINED `api/<name>.js` (ESM) with the `@kiln/*`
 * code inlined. `@anthropic-ai/sdk` stays external — it's a normal npm package Vercel installs and
 * Node loads as JS. Runs from the Vercel build command before `vite build`.
 */

import { build } from "esbuild";
import { readdirSync, mkdirSync } from "node:fs";

const entryPoints = readdirSync("functions")
  .filter((f) => f.endsWith(".ts") && !f.startsWith("_"))
  .map((f) => `functions/${f}`);

mkdirSync("api", { recursive: true });

await build({
  entryPoints,
  outdir: "api",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // The SDK is a real npm dep available at runtime; everything else (incl. @kiln/*) is inlined.
  external: ["@anthropic-ai/sdk"],
  logLevel: "info",
});

console.log(`[build-functions] bundled ${entryPoints.length} functions → api/`);
