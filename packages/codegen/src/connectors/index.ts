/**
 * @kiln/codegen/connectors — the connector plugin seam's ENTRY POINT (SPEC-013 §4.3, Phase A).
 *
 * Mirrors `engines/index.ts`: importing this module is where the built-in connectors would register
 * themselves as a side effect. Phase A ships the SEAM ONLY — there is NO built-in connector yet
 * (Spreadsheet-over-Nango is Phase B), so nothing is registered here; the acceptance probe registers a
 * fake connector in the test to prove the registry works with zero edits to core dispatch.
 *
 * TO ADD A CONNECTOR (Phase B+): create `connectors/<id>.ts` (a `ConnectorAdapter` wrapping its `ToolDef`
 * + `emitNango`/optional `emitN8n`), import it here, and add one `registerConnector(...)` line below.
 *
 * PURE + ISOMORPHIC (golden invariant #4): NO `node:*`. Registration order does not matter —
 * `registeredConnectors()` sorts by tool id for deterministic output.
 */

// Phase A: no built-in connectors to register yet. (Phase B adds the Spreadsheet adapter here.)

// Re-export the registry API + the contract types (the public seam).
export { registerConnector, getConnectorAdapter, registeredConnectors } from "./registry.ts";
export type { ConnectorAdapter, ConnectorCtx } from "./registry.ts";
