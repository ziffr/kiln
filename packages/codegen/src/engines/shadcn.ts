/**
 * Built-in engine: shadcn/ui (React) — a UI-only engine; a generated Vite/React/shadcn front-end.
 * Serves the app's screens, provides nothing else. `serve-ui` is APP-LEVEL (not per-element), so this
 * engine never appears in the binding resolution — `projectTargets` adds it to the dispatch set from
 * the binding's `serve-ui` default, and `applies` gates on it being shadcn (mirrors the old
 * `uiGenerated` gate). Wraps the existing `shadcnAdapter` (kept in ui.ts) byte-for-byte (SPEC-010 Phase 1).
 */
import type { Engine } from "../targets.ts";
import { shadcnAdapter } from "../ui.ts";
import type { EngineAdapter } from "./registry.ts";

export const SHADCN: Engine = {
  id: "shadcn",
  name: "shadcn/ui (React)",
  reach: "http",
  provides: { "serve-ui": "native", store: "none", operate: "none", emit: "none", react: "none", sequence: "none", authorize: "none" },
};

export const shadcnEngineAdapter: EngineAdapter = {
  engine: SHADCN,
  // serve-ui is read from the binding directly (app-level); we generate the UI only when it's shadcn.
  applies: (ctx) => (ctx.binding.defaults["serve-ui"] ?? "shadcn") === "shadcn",
  generate: (ctx) => ({ files: shadcnAdapter(ctx.caps, ctx.domain, ctx.contexts, ctx.theme, ctx.workflows, ctx.roles, ctx.i18n, ctx.views) }),
};
