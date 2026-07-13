/**
 * Built-in engine: Odoo — a full business platform that owns a whole vertical slice (store + operate +
 * authorize + react), so it `couplesStore`. The engine that shrinks the spine the most. Wraps the
 * existing `odooAdapter` (kept in targets.ts) into the uniform contract byte-for-byte (SPEC-010 Phase 1).
 *
 * NOTE the path prefix: `odooAdapter` returns UNPREFIXED module-relative paths (`__manifest__.py`,
 * `models/models.py`, …). The exporter still prefixes them with `odoo/<module>/` from the named `odoo`
 * slot, so this adapter emits them unprefixed — identical to today.
 */
import { odooAdapter, type Engine } from "../targets.ts";
import type { EngineAdapter } from "./registry.ts";

export const ODOO: Engine = {
  id: "odoo",
  name: "Odoo",
  reach: "http",
  couplesStore: true,
  provides: { store: "native", operate: "native", emit: "native", react: "native", sequence: "partial", authorize: "native", "serve-ui": "native" },
};

export const odooEngineAdapter: EngineAdapter = {
  engine: ODOO,
  generate: (ctx) => ({ files: odooAdapter(ctx.resolved, ctx.caps, ctx.domain, ctx.roles) }),
};
