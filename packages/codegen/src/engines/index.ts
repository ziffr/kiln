/**
 * @kiln/codegen/engines — the engine plugin seam's ENTRY POINT (SPEC-010, Phase 1).
 *
 * Importing this module REGISTERS the six built-in engines as a side effect (their descriptors +
 * adapter wrappers). `targets.ts` imports this before it derives `ENGINES` from the registry, so the
 * binding + validators see every built-in with no second edit. It also re-exports the registry API +
 * the contract types so `@kiln/codegen`'s public surface exposes the seam.
 *
 * TO ADD AN ENGINE: create `engines/<id>.ts` (descriptor + adapter, wrapping your generator), import it
 * here, and add one `registerEngine(...)` line below. No edits to `projectTargets` or `assembleFullStack`.
 *
 * PURE + ISOMORPHIC (golden invariant #4): NO `node:*`. Registration order does not matter —
 * `registeredEngines()` sorts by id for deterministic output.
 */
import { registerEngine } from "./registry.ts";
import { postgresEngineAdapter } from "./postgres.ts";
import { sqliteEngineAdapter } from "./sqlite.ts";
import { n8nEngineAdapter } from "./n8n.ts";
import { odooEngineAdapter } from "./odoo.ts";
import { shadcnEngineAdapter } from "./shadcn.ts";
import { spineEngineAdapter } from "./spine.ts";
import { langdockEngineAdapter } from "./langdock.ts";

// Side-effect registration of the built-ins (the descriptors that were the literal `ENGINES` map).
registerEngine(postgresEngineAdapter);
registerEngine(sqliteEngineAdapter);
registerEngine(n8nEngineAdapter);
registerEngine(odooEngineAdapter);
registerEngine(shadcnEngineAdapter);
registerEngine(spineEngineAdapter);
registerEngine(langdockEngineAdapter); // agent-runtime target (SPEC-010); opt-in via binding.agentRuntime

// Re-export the registry API + the contract types (the public seam).
export { registerEngine, getEngineAdapter, registeredEngines } from "./registry.ts";
export type { EngineAdapter, EngineContext, EngineOutput } from "./registry.ts";
