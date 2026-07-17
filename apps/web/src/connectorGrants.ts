/**
 * Connector grant helpers (SPEC-013 Phase B2, §4.9) — the PURE logic behind the Agents-stage Tools UI.
 *
 * These functions carry the honesty the spec's UX findings demand, kept out of the React component so
 * they can be unit-tested (apps/web/test/connectorGrants.test.ts):
 *   · the CATALOG of grantable connectors comes from the registered `ConnectorAdapter`s (@kiln/codegen) —
 *     the same source of truth the exporter uses, never a hand-maintained list;
 *   · READINESS is derived from a live Nango connection check (B1's `/api/connectors/connections`) and is
 *     a three-state shape+text value, rolled up so an agent with granted-but-unconnected tools never reads
 *     as wired (UX2);
 *   · SCOPE honesty (UX5): a per-op grant restricts the *tool surface*, not the token — so we compute the
 *     union of scopes the granted ops need and, when the connection reports its actual granted scopes, the
 *     EXCESS the connection carries beyond that need;
 *   · SUGGESTIONS are a light, grounded heuristic — inert until a human accepts one at a time (UX3): this
 *     module only proposes; it never mutates a grant.
 *
 * No React, no `fetch`, no `node:*` — pure over its inputs (the catalog is a synchronous registry read).
 */

import type { AgentInput, AgentGrant, ToolDef, ToolOperation, ToolOperationKind } from "@kiln/compiler";
import { registeredConnectors } from "@kiln/codegen";

/** Op kinds that carry blast radius — the write/send/delete gate (SEC4) and the visual separation (UX6). */
export const MUTATING_KINDS: ReadonlySet<ToolOperationKind> = new Set(["write", "send", "delete"]);
export function isMutating(kind: ToolOperationKind): boolean {
  return MUTATING_KINDS.has(kind);
}

/** The grantable connectors — the registered adapters' grant surfaces, deterministically ordered. */
export function connectorCatalog(): ToolDef[] {
  return registeredConnectors().map((a) => a.toolDef);
}

export function toolById(id: string, catalog: ToolDef[] = connectorCatalog()): ToolDef | undefined {
  return catalog.find((t) => t.id === id);
}

export function operationByName(tool: ToolDef, op: string): ToolOperation | undefined {
  return tool.operations.find((o) => o.name === op);
}

/**
 * A connection's non-secret status (mirrors B1's `ConnectionStatus`). `scopes` is OPTIONAL: B1's
 * connections endpoint does not surface OAuth scopes today (§4.7 SEC2/UX5 note), so the UI degrades to
 * showing the scopes the grant NEEDS when the live scopes are absent — see `scopeReport`.
 */
export interface ConnectionStatus {
  connectionId: string;
  provider: string;
  connected: boolean;
  scopes?: string[];
}

/** The three honest readiness states (UX2) — shape+text, never colour alone. */
export type ReadinessState = "granted" | "connected" | "error";

/**
 * Readiness for a single grant. No `connectionRef` → `granted` (a model edit with no live account yet).
 * A ref that resolves to a connected connection → `connected`. A ref that no longer resolves (revoked at
 * Nango, or a failed check) → `error` — the honest "you thought this was wired; it isn't".
 */
export function grantReadiness(grant: AgentGrant, connections: ConnectionStatus[]): ReadinessState {
  if (!grant.connectionRef) return "granted";
  const conn = connections.find((c) => c.connectionId === grant.connectionRef);
  if (conn && conn.connected) return "connected";
  return "error";
}

export interface ReadinessRollup {
  total: number;
  granted: number; // granted, no live connection
  connected: number;
  error: number;
  /** the worst-case one-line state for the agent: connected only when EVERY grant is connected. */
  overall: ReadinessState | "none";
}

/**
 * Roll a set of grants up to one agent-level state. The rule is deliberately pessimistic (UX2): an agent
 * reads `connected` only when it has grants AND every one is connected; a single unconnected or errored
 * grant keeps it off. Zero grants → `none` (nothing to be wired).
 */
export function readinessRollup(grants: AgentGrant[], connections: ConnectionStatus[]): ReadinessRollup {
  const states = grants.map((g) => grantReadiness(g, connections));
  const granted = states.filter((s) => s === "granted").length;
  const connected = states.filter((s) => s === "connected").length;
  const error = states.filter((s) => s === "error").length;
  const total = states.length;
  const overall: ReadinessState | "none" =
    total === 0 ? "none" : error > 0 ? "error" : granted > 0 ? "granted" : "connected";
  return { total, granted, connected, error, overall };
}

export interface ScopeReport {
  /** the union of OAuth scopes the granted ops require (from the ToolDef). */
  needed: string[];
  /** the connection's actual granted scopes, when the live check reports them (else empty). */
  actual: string[];
  /** actual scopes beyond what the granted ops need — the over-grant to warn about (UX5). */
  excess: string[];
  /** true when the connection reported scopes at all (else the UI shows only `needed`, honestly). */
  actualKnown: boolean;
}

/**
 * The scope honesty report (UX5 / SEC2). `needed` is the union of the granted ops' `scopes`. `excess` is
 * every actual scope not in `needed` — the tokens the bound connection can do that this grant doesn't ask
 * for. When the connection doesn't report scopes (B1 today), `actualKnown` is false and `excess` is empty:
 * we surface the *needed* scopes and say plainly the live scopes aren't reported, rather than fabricate a
 * clean bill of health.
 */
export function scopeReport(tool: ToolDef, grantedOps: string[], conn?: ConnectionStatus): ScopeReport {
  const needed = [
    ...new Set(
      grantedOps
        .map((op) => operationByName(tool, op))
        .flatMap((o) => o?.scopes ?? []),
    ),
  ].sort();
  const actual = conn?.scopes ? [...new Set(conn.scopes)].sort() : [];
  const actualKnown = Array.isArray(conn?.scopes);
  const neededSet = new Set(needed);
  const excess = actual.filter((s) => !neededSet.has(s));
  return { needed, actual, excess, actualKnown };
}

/**
 * Pick the connection that NEWLY appeared — connected, and not present in the `before` snapshot taken just
 * before the Connect popup opened. That is the account the user just authorized in Nango's hosted UI. A
 * `provider` narrows the choice to a specific integration when one is known; otherwise the newest fresh
 * connection is taken. Pure — the in-flow poll loop calls it each tick to detect the returned account.
 */
export function newlyConnected(before: ConnectionStatus[], current: ConnectionStatus[], provider?: string): ConnectionStatus | undefined {
  const beforeIds = new Set(before.map((c) => c.connectionId));
  const fresh = current.filter((c) => c.connected && c.connectionId && !beforeIds.has(c.connectionId));
  return (provider ? fresh.find((c) => c.provider === provider) : undefined) ?? fresh[0];
}

export interface PollForConnectionDeps {
  /** re-fetch the (non-secret) connection list — B1's `/api/connectors/connections`. */
  list: () => Promise<ConnectionStatus[]>;
  /** the connections known BEFORE the popup opened, so a returning account reads as NEW (not a pre-existing one). */
  before: ConnectionStatus[];
  /** narrow to a specific integration's provider when the grant targets one (else the newest fresh connection). */
  provider?: string;
  /** true → stop polling (the user closed the popup without authorizing). Leaves the honest "granted" state. */
  isCancelled?: () => boolean;
  /** injectable so tests never actually wait. */
  sleep?: (ms: number) => Promise<void>;
  intervalMs?: number;
  timeoutMs?: number;
}

/**
 * Poll the connection list until the just-authorized account appears (via `newlyConnected`), then resolve
 * it — so the SPA can bind its opaque `connectionId` onto the grant WITHOUT leaving the app. Resolves
 * `undefined` on cancel (popup closed) or timeout — the caller then leaves the grant in its honest
 * "granted (no live connection)" state, no error. Deps are injected so this is unit-testable with no browser,
 * no network, and no real timers.
 */
export async function pollForConnection(deps: PollForConnectionDeps): Promise<ConnectionStatus | undefined> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const interval = deps.intervalMs ?? 2000;
  const timeout = deps.timeoutMs ?? 120000;
  const deadline = Date.now() + timeout;
  for (;;) {
    const current = await deps.list();
    const found = newlyConnected(deps.before, current, deps.provider);
    if (found) return found;
    if (deps.isCancelled?.()) return undefined;
    if (Date.now() >= deadline) return undefined;
    await sleep(interval);
  }
}

/** A model-proposed grant, grounded in the agent — inert until a human accepts it (UX3). */
export interface GrantSuggestion {
  toolId: string;
  operations: string[];
  /** the grounding: a short reason referencing the agent's goal/capabilities (a `derivedFrom` in prose). */
  reason: string;
}

/**
 * A LIGHT, deterministic suggestion heuristic (the point of the feature is the human-gated accept, not the
 * suggester — a real model call can replace this later). It proposes a connector only when the agent's
 * goal/capabilities hint at the connector's domain, proposes only its READ/LIST ops (a suggestion never
 * pre-authorizes a write — that stays an explicit human choice), and never re-proposes an already-granted
 * tool. Returns the whole set; the UI accepts them ONE AT A TIME — there is no bulk apply.
 */
const SUGGESTION_HINTS: Record<string, string[]> = {
  spreadsheet: ["spreadsheet", "sheet", "excel", "import", "export", "row", "record", "report", "lead", "list", "roster", "register"],
};

export function suggestGrants(agent: AgentInput, catalog: ToolDef[] = connectorCatalog()): GrantSuggestion[] {
  const granted = new Set((agent.grants ?? []).map((g) => g.toolId));
  const haystack = `${agent.goal ?? ""} ${agent.name ?? ""} ${(agent.capabilities ?? []).join(" ")} ${agent.instructions ?? ""}`.toLowerCase();
  const out: GrantSuggestion[] = [];
  for (const tool of catalog) {
    if (granted.has(tool.id)) continue;
    const hints = SUGGESTION_HINTS[tool.id] ?? [tool.id, tool.name.toLowerCase()];
    const hit = hints.find((h) => haystack.includes(h));
    if (!hit) continue;
    const readOps = tool.operations.filter((o) => !isMutating(o.kind)).map((o) => o.name);
    if (readOps.length === 0) continue;
    out.push({ toolId: tool.id, operations: readOps, reason: hit });
  }
  return out;
}

/** A flat authority row for the per-project audit view (UX4): agent × connector × op × connection. */
export interface AuthorityRow {
  agentId: string;
  agentName: string;
  toolId: string;
  toolName: string;
  op: string;
  kind: ToolOperationKind | "?";
  autonomous: boolean;
  connectionRef?: string;
  readiness: ReadinessState;
}

/** Flatten every agent's grants into one auditable list. Pure — the "granted authority" ledger (UX4). */
export function authorityLedger(agents: AgentInput[], connections: ConnectionStatus[], catalog: ToolDef[] = connectorCatalog()): AuthorityRow[] {
  const rows: AuthorityRow[] = [];
  for (const agent of agents) {
    for (const g of agent.grants ?? []) {
      const tool = toolById(g.toolId, catalog);
      const readiness = grantReadiness(g, connections);
      for (const op of g.operations) {
        rows.push({
          agentId: agent.id,
          agentName: agent.name || agent.id,
          toolId: g.toolId,
          toolName: tool?.name || g.toolId,
          op,
          kind: operationByName(tool ?? ({ operations: [] } as unknown as ToolDef), op)?.kind ?? "?",
          autonomous: Boolean(g.autonomous),
          connectionRef: g.connectionRef,
          readiness,
        });
      }
    }
  }
  return rows;
}
