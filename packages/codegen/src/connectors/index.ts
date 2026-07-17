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

// Phase B1: the built-in Spreadsheet (Google Sheets) connector registers itself on import (side effect),
// exactly like the engines do. Importing this module is what makes it discoverable to the exporter.
import "./spreadsheet.ts";

// Re-export the registry API + the contract types (the public seam).
export { registerConnector, getConnectorAdapter, registeredConnectors } from "./registry.ts";
export type { ConnectorAdapter, ConnectorCtx } from "./registry.ts";
// The Spreadsheet connector's grant surface + adapter (Phase B1), for callers that seed the catalog.
export { SPREADSHEET_TOOL, spreadsheetConnector } from "./spreadsheet.ts";
