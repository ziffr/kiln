/**
 * Built-in engine: PostgreSQL — a first-class store + row-level authz; can emit via LISTEN/NOTIFY;
 * not an orchestrator. Wraps the existing `postgresAdapter` (which stays in targets.ts) into the
 * uniform `EngineAdapter` contract without changing a byte it emits (SPEC-010 Phase 1).
 *
 * The descriptor lives HERE (one source of truth) — targets.ts re-exports `POSTGRES` and derives
 * `ENGINES` from the registry. The `generate` closure calls `postgresAdapter` only at run time, so
 * the targets.ts ↔ engines import cycle never touches an uninitialized binding.
 */
import { postgresAdapter, type Engine } from "../targets.ts";
import type { EngineAdapter } from "./registry.ts";

export const POSTGRES: Engine = {
  id: "postgres",
  name: "PostgreSQL",
  reach: "sql",
  provides: { store: "native", authorize: "native", emit: "partial", operate: "partial", react: "none", sequence: "none", "serve-ui": "none" },
};

export const postgresEngineAdapter: EngineAdapter = {
  engine: POSTGRES,
  // mirrors the old `dialect === "postgres" ? … : ""` gate.
  applies: (ctx) => ctx.dialect === "postgres",
  generate: (ctx) => {
    const schema = postgresAdapter(ctx.resolved, ctx.domain, ctx.roles);
    return { files: schema ? { "postgres/schema.sql": schema } : {} };
  },
};
