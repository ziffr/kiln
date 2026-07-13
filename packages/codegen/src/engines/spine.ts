/**
 * Built-in engine: the generated spine (Node) — the fallback hub that fills whatever no external engine
 * covers, and the thing the others call. Deliberately hand-owned business logic (ADR-002); codegen
 * emits the skeleton. Its engine id is `node`; its output lands in the `spine/` prefix.
 *
 * Wraps the existing `spineAdapter` (kept in spine.ts) into the uniform contract byte-for-byte. `applies`
 * mirrors the old `spineHosted` gate: emit only when a command actually landed on the node engine
 * (SPEC-010 Phase 1).
 */
import type { Engine } from "../targets.ts";
import { spineAdapter } from "../spine.ts";
import type { EngineAdapter } from "./registry.ts";

export const NODE_SPINE: Engine = {
  id: "node",
  name: "Generated spine (Node)",
  reach: "http",
  provides: { operate: "native", emit: "native", react: "native", sequence: "native", store: "partial", authorize: "partial", "serve-ui": "partial" },
};

export const spineEngineAdapter: EngineAdapter = {
  engine: NODE_SPINE,
  // mirrors the old `spineHosted` gate: the spine hosts commands bound to the node engine.
  applies: (ctx) => ctx.resolved.some((r) => r.kind === "command" && r.engineId === "node"),
  generate: (ctx) => ({ files: spineAdapter(ctx.caps, ctx.domain, ctx.handlers, ctx.dialect) }),
};
