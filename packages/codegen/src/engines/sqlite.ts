/**
 * Built-in engine: SQLite (embedded) — a single-container, file-based store (no separate db service).
 * Same `store` role as Postgres, minus server features (no RLS). Wraps the existing `sqliteAdapter`
 * (kept in targets.ts) into the uniform `EngineAdapter` contract, byte-for-byte (SPEC-010 Phase 1).
 */
import { sqliteAdapter, type Engine } from "../targets.ts";
import type { EngineAdapter } from "./registry.ts";

export const SQLITE: Engine = {
  id: "sqlite",
  name: "SQLite (embedded)",
  reach: "in-process",
  provides: { store: "native", authorize: "none", emit: "partial", operate: "partial", react: "none", sequence: "none", "serve-ui": "none" },
};

export const sqliteEngineAdapter: EngineAdapter = {
  engine: SQLITE,
  // mirrors the old `dialect === "sqlite" ? … : ""` gate.
  applies: (ctx) => ctx.dialect === "sqlite",
  generate: (ctx) => {
    const schema = sqliteAdapter(ctx.resolved, ctx.domain);
    return { files: schema ? { "sqlite/schema.sql": schema } : {} };
  },
};
