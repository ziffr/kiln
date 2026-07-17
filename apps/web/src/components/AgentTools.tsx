/**
 * The Agents-stage TOOLS tab (SPEC-013 Phase B2, §4.9) — where a human GRANTS a connector to an agent and
 * CONNECTS a live account. It renders the three visibly-separate acts the spec's invariant #6 demands:
 *
 *   1. SUGGEST   — the model proposes grants (grounded in the agent); each is accepted ONE AT A TIME or
 *                  dismissed. There is deliberately NO "grant all" / auto-accept (UX3).
 *   2. GRANT     — a per-op multi-select GROUPED BY KIND with read-only ops visually separated from
 *                  write/send/delete (UX6), each op carrying an on-demand "what this lets the agent do"
 *                  explanation. Granting edits `agent.grants` — a reversible model edit, no real-world
 *                  effect. An `autonomous` toggle gates write/send/delete at runtime (default off, SEC4).
 *   3. CONNECT   — a SEPARATE, deliberately-confirmed step (UX1) that names the provider + account + the
 *                  scopes being authorized, then mints a Nango Connect session server-side (the browser
 *                  never sees the secret, invariant #3). Readiness (UX2) is a shape+text status, never
 *                  colour alone; the bound connection's real scopes are surfaced with an over-grant warning
 *                  (UX5). Revoke states plainly what it does to the Nango connection (UX4).
 *
 * Presentational: every mutation, the session mint, and the connection check live in App. This file only
 * renders the gates and calls back. Pure grant/readiness/scope logic is in ../connectorGrants.
 */

import { useState } from "react";
import { Icon } from "./Icon";
import {
  connectorCatalog, toolById, isMutating, grantReadiness, readinessRollup, scopeReport,
  suggestGrants, authorityLedger, type ConnectionStatus, type ReadinessState, type GrantSuggestion,
} from "../connectorGrants";
import type { AgentInput, AgentGrant, ToolDef, ToolOperation } from "@kiln/compiler";

type T = (k: string, o?: Record<string, unknown>) => string;

export type AgentToolsProps = {
  agent: AgentInput;
  /** every agent in the project — for the per-project "granted authority" audit view (UX4). */
  allAgents: AgentInput[];
  /** live connection status from B1's `/api/connectors/connections` (readiness + real scopes). */
  connections: ConnectionStatus[];
  /** true when the server has a Nango secret configured — gates the live-connect step honestly. */
  connectorsReady: boolean;
  /** whether the connection status has been fetched yet (drives a "checking…" vs "granted" distinction). */
  connectionsChecked: boolean;
  /** grant `operations` for `toolId` on `agent` (accept a suggestion, or add ops). Reversible model edit. */
  onGrant: (toolId: string, operations: string[]) => void;
  /** replace the granted op set (the multi-select). Empty → the grant is removed. */
  onSetOperations: (toolId: string, operations: string[]) => void;
  /** flip a grant's autonomous flag (write/send/delete skip the per-invocation gate when true). */
  onSetAutonomous: (toolId: string, autonomous: boolean) => void;
  /** revoke the grant entirely (removes it + detaches the connection reference). */
  onRevoke: (toolId: string) => void;
  /** the deliberate connect step — mints a session server-side + binds a connectionRef. Returns/throws. */
  onConnect: (toolId: string) => void;
  /** which tool is mid-connect (spinner) and the last connect error, keyed by toolId. */
  connecting?: string | null;
  connectError?: { toolId: string; message: string } | null;
  /** the opt-in "run against the live connection" consent flag + toggle (UX7; a stub badge in B2). */
  liveRunMode: boolean;
  onToggleLiveRunMode: (v: boolean) => void;
  t: T;
};

export function AgentTools(props: AgentToolsProps): React.JSX.Element {
  const { agent, allAgents, connections, connectorsReady, connectionsChecked, onGrant, liveRunMode, onToggleLiveRunMode, t } = props;
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const catalog = connectorCatalog();
  const grants = agent.grants ?? [];
  const suggestions = suggestGrants(agent, catalog).filter((s) => !dismissed.has(s.toolId));
  const rollup = readinessRollup(grants, connections);
  const ungranted = catalog.filter((tl) => !grants.some((g) => g.toolId === tl.id));

  return (
    <div className="agent-tab agent-tools">
      <p className="run-lead muted">{t("agentToolsLead")}</p>

      {/* Agent-level readiness roll-up — pessimistic: nothing reads as wired unless every grant is (UX2). */}
      {rollup.total > 0 && (
        <div className={`agent-tools-rollup rd-${rollup.overall}`} role="status" aria-label={t("agentToolsReadiness")}>
          <ReadinessBadge state={rollup.overall === "none" ? "granted" : rollup.overall} t={t} />
          <span className="muted agent-tools-rollup-detail">
            {t("agentToolsRollup", { connected: rollup.connected, total: rollup.total })}
          </span>
        </div>
      )}

      {/* 1. SUGGESTED grants — accepted one at a time; NO bulk apply (UX3). */}
      {suggestions.length > 0 && (
        <section className="agent-tools-suggest" aria-label={t("agentToolsSuggestTitle")}>
          <div className="agent-tools-section-head">
            <span className="agent-tools-section-title"><Icon name="sparkles" size={12} />{t("agentToolsSuggestTitle")}</span>
          </div>
          <p className="muted agent-tools-suggest-lead">{t("agentToolsSuggestLead")}</p>
          <ul className="agent-tools-suggest-list">
            {suggestions.map((s) => (
              <SuggestionRow key={s.toolId} suggestion={s} tool={toolById(s.toolId, catalog)} onAccept={() => onGrant(s.toolId, s.operations)} onDismiss={() => dismiss(s.toolId)} t={t} />
            ))}
          </ul>
        </section>
      )}

      {/* 2/3. GRANTED connectors — the per-op control, autonomous toggle, connect, readiness, revoke. */}
      {grants.length === 0 && suggestions.length === 0 && (
        <p className="muted agent-tools-empty">{t("agentToolsNone")}</p>
      )}
      {grants.map((g) => {
        const tool = toolById(g.toolId, catalog);
        if (!tool) return <UnknownGrant key={g.toolId} toolId={g.toolId} onRevoke={() => props.onRevoke(g.toolId)} t={t} />;
        return (
          <GrantCard
            key={g.toolId}
            grant={g}
            tool={tool}
            readiness={grantReadiness(g, connections)}
            connection={connections.find((c) => c.connectionId === g.connectionRef)}
            connectorsReady={connectorsReady}
            connectionsChecked={connectionsChecked}
            connecting={props.connecting === g.toolId}
            connectError={props.connectError?.toolId === g.toolId ? props.connectError.message : null}
            onSetOperations={(ops) => props.onSetOperations(g.toolId, ops)}
            onSetAutonomous={(v) => props.onSetAutonomous(g.toolId, v)}
            onConnect={() => props.onConnect(g.toolId)}
            onRevoke={() => props.onRevoke(g.toolId)}
            t={t}
          />
        );
      })}

      {/* Grant a connector the model didn't suggest — still one human choice, still no bulk. */}
      {ungranted.length > 0 && (
        <AddConnector tools={ungranted} onGrant={(id, ops) => onGrant(id, ops)} t={t} />
      )}

      {/* 7. Test-run mode consent — mock by default; a distinctly-badged opt-in live mode (UX7). */}
      <section className="agent-tools-liverun" aria-label={t("agentToolsLiveRunTitle")}>
        <label className="agent-tools-liverun-toggle">
          <input type="checkbox" checked={liveRunMode} disabled={rollup.connected === 0} onChange={(e) => onToggleLiveRunMode(e.target.checked)} aria-describedby="liverun-hint" />
          <span>{t("agentToolsLiveRun")}</span>
          {liveRunMode && <span className="agent-tools-live-badge" title={t("agentToolsLiveRunBadgeHint")}><Icon name="alert" size={10} />{t("agentToolsLiveRunBadge")}</span>}
        </label>
        <p id="liverun-hint" className="muted agent-tools-liverun-hint">
          {rollup.connected === 0 ? t("agentToolsLiveRunNoConn") : t("agentToolsLiveRunHint")}
        </p>
      </section>

      {/* 4. The per-project "granted authority" audit view — on demand (UX4). */}
      <AuthorityView agents={allAgents} connections={connections} t={t} />
    </div>
  );

  // Dismissing a suggestion is component state, not a model edit — dismissing proposes nothing (UX3).
  function dismiss(toolId: string): void { setDismissed((prev) => new Set(prev).add(toolId)); }
}

/* ── Readiness badge — shape + text, never colour alone (UX2) ─────────────────────────────────────── */
function ReadinessBadge({ state, t }: { state: ReadinessState; t: T }): React.JSX.Element {
  const icon = state === "connected" ? "check" : state === "error" ? "alert" : "lock";
  const label = state === "connected" ? t("agentToolsStateConnected") : state === "error" ? t("agentToolsStateError") : t("agentToolsStateGranted");
  return (
    <span className={`agent-tools-badge rd-${state}`}>
      <Icon name={icon} size={11} />{label}
    </span>
  );
}

/* ── A suggested grant — accept (one) / dismiss. No bulk accept exists (UX3). ─────────────────────── */
function SuggestionRow({ suggestion, tool, onAccept, onDismiss, t }: {
  suggestion: GrantSuggestion; tool?: ToolDef; onAccept: () => void; onDismiss: () => void; t: T;
}): React.JSX.Element {
  return (
    <li className="agent-tools-suggest-row">
      <div className="agent-tools-suggest-main">
        <span className="agent-tools-suggest-name">{tool?.name ?? suggestion.toolId}</span>
        <span className="muted agent-tools-suggest-provider">{tool?.providerLabel}</span>
        <span className="muted agent-tools-suggest-reason">{t("agentToolsSuggestReason", { ops: suggestion.operations.join(", ") })}</span>
      </div>
      <div className="agent-tools-suggest-actions">
        <button className="btn primary sm" onClick={onAccept} title={t("agentToolsAcceptHint")}>
          <Icon name="check" size={12} />{t("agentToolsAccept")}
        </button>
        <button className="btn ghost sm" onClick={onDismiss} title={t("agentToolsDismissHint")} aria-label={t("agentToolsDismiss")}>
          <Icon name="x" size={12} />
        </button>
      </div>
    </li>
  );
}

/* ── A granted connector: the op control, autonomous toggle, connect step, readiness, revoke ──────── */
function GrantCard({ grant, tool, readiness, connection, connectorsReady, connectionsChecked, connecting, connectError, onSetOperations, onSetAutonomous, onConnect, onRevoke, t }: {
  grant: AgentGrant; tool: ToolDef; readiness: ReadinessState; connection?: ConnectionStatus;
  connectorsReady: boolean; connectionsChecked: boolean; connecting: boolean; connectError: string | null;
  onSetOperations: (ops: string[]) => void; onSetAutonomous: (v: boolean) => void;
  onConnect: () => void; onRevoke: () => void; t: T;
}): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const [explain, setExplain] = useState<string | null>(null);
  const grantedOps = new Set(grant.operations);
  const reads = tool.operations.filter((o) => !isMutating(o.kind));
  const writes = tool.operations.filter((o) => isMutating(o.kind));
  const hasMutating = grant.operations.some((op) => { const o = tool.operations.find((x) => x.name === op); return o ? isMutating(o.kind) : false; });
  const scopes = scopeReport(tool, grant.operations, connection);

  const toggleOp = (op: string): void => {
    const next = new Set(grantedOps);
    if (next.has(op)) next.delete(op); else next.add(op);
    onSetOperations([...next]);
  };

  return (
    <section className="agent-tools-grant" aria-label={`${tool.name} ${t("agentToolsGrant")}`}>
      <div className="agent-tools-grant-head">
        <div className="agent-tools-grant-id">
          <span className="agent-tools-grant-name">{tool.name}</span>
          <span className="muted agent-tools-grant-provider">{tool.providerLabel}</span>
        </div>
        <ReadinessBadge state={readiness} t={t} />
      </div>

      {/* Op multi-select, GROUPED BY KIND (UX6): read/list separated from write/send/delete. */}
      <div className="agent-tools-ops" role="group" aria-label={t("agentToolsOps")}>
        <OpGroup title={t("agentToolsOpsRead")} ops={reads} granted={grantedOps} onToggle={toggleOp} onExplain={setExplain} explain={explain} mutating={false} t={t} />
        {writes.length > 0 && (
          <OpGroup title={t("agentToolsOpsWrite")} ops={writes} granted={grantedOps} onToggle={toggleOp} onExplain={setExplain} explain={explain} mutating={true} t={t} />
        )}
      </div>

      {/* Autonomy — only meaningful once a write/send/delete op is granted (SEC4 gate). */}
      {hasMutating && (
        <label className="agent-tools-autonomous">
          <input type="checkbox" checked={Boolean(grant.autonomous)} onChange={(e) => onSetAutonomous(e.target.checked)} aria-describedby={`auto-hint-${tool.id}`} />
          <span>{t("agentToolsAutonomous")}</span>
        </label>
      )}
      {hasMutating && (
        <p id={`auto-hint-${tool.id}`} className={`muted agent-tools-autonomous-hint ${grant.autonomous ? "warn" : ""}`}>
          {grant.autonomous ? t("agentToolsAutonomousOn") : t("agentToolsAutonomousOff")}
        </p>
      )}

      {/* 3. CONNECT — a SEPARATE, deliberately-confirmed step naming provider + account + scopes (UX1). */}
      <div className="agent-tools-connect">
        {readiness === "connected" ? (
          <div className="agent-tools-conn-ok">
            <span className="agent-tools-conn-ref" title={t("agentToolsConnRefHint")}>
              <Icon name="check" size={12} />{t("agentToolsConnectedTo", { provider: tool.providerLabel })}
              <code className="agent-tools-ref">{grant.connectionRef}</code>
            </span>
            <ScopeReadout scopes={scopes} t={t} />
            <button className="btn ghost sm agent-tools-revoke" onClick={onRevoke} title={t("agentToolsRevokeHint")}>
              <Icon name="x" size={12} />{t("agentToolsRevoke")}
            </button>
          </div>
        ) : confirming ? (
          <div className="agent-tools-confirm" role="dialog" aria-label={t("agentToolsConnectConfirmTitle")}>
            <p className="agent-tools-confirm-title"><Icon name="lock" size={12} />{t("agentToolsConnectConfirmTitle")}</p>
            <p className="agent-tools-confirm-body">{t("agentToolsConnectConfirmBody", { provider: tool.providerLabel })}</p>
            <div className="agent-tools-confirm-scopes">
              <span className="agent-tools-scopes-label">{t("agentToolsScopesToAuthorize")}</span>
              {scopes.needed.length ? (
                <ul className="agent-tools-scope-list">{scopes.needed.map((s) => <li key={s}><code>{scopeShort(s)}</code></li>)}</ul>
              ) : <span className="muted">{t("agentToolsScopesNone")}</span>}
            </div>
            {!connectorsReady && <p className="agent-tools-connect-warn"><Icon name="alert" size={12} />{t("agentToolsConnectNotConfigured")}</p>}
            <div className="agent-tools-confirm-actions">
              <button className="btn primary sm" onClick={() => { setConfirming(false); onConnect(); }} disabled={connecting}>
                <Icon name={connecting ? "refresh" : "check"} size={12} />{connecting ? t("agentToolsConnecting") : t("agentToolsConnectConfirm")}
              </button>
              <button className="btn ghost sm" onClick={() => setConfirming(false)}>{t("cancel")}</button>
            </div>
          </div>
        ) : (
          <button className="btn sm agent-tools-connect-btn" onClick={() => setConfirming(true)} disabled={grant.operations.length === 0}>
            <Icon name="external" size={13} />{t("agentToolsConnect")}
          </button>
        )}
        {readiness === "error" && connectionsChecked && !confirming && (
          <p className="agent-tools-conn-err" role="alert"><Icon name="alert" size={12} />{t("agentToolsConnLost")}
            <button className="btn ghost sm agent-tools-revoke" onClick={onRevoke} title={t("agentToolsRevokeHint")}>{t("agentToolsRevoke")}</button>
          </p>
        )}
        {connectError && <p className="agent-tools-conn-err" role="alert"><Icon name="alert" size={12} />{connectError}</p>}
      </div>
    </section>
  );
}

/* An op group (Read vs Write) — a labelled fieldset with each op as a checkbox + on-demand explanation. */
function OpGroup({ title, ops, granted, onToggle, onExplain, explain, mutating, t }: {
  title: string; ops: ToolOperation[]; granted: Set<string>; onToggle: (op: string) => void;
  onExplain: (op: string | null) => void; explain: string | null; mutating: boolean; t: T;
}): React.JSX.Element {
  return (
    <fieldset className={`agent-tools-opgroup ${mutating ? "mutating" : "reading"}`}>
      <legend className="agent-tools-opgroup-title">
        {title}
        {mutating && <span className="agent-tools-write-mark" title={t("agentToolsWriteMarkHint")}><Icon name="alert" size={10} />{t("agentToolsWriteMark")}</span>}
      </legend>
      {ops.map((op) => (
        <div key={op.name} className="agent-tools-op">
          <label className="agent-tools-op-label">
            <input type="checkbox" checked={granted.has(op.name)} onChange={() => onToggle(op.name)} />
            <code className="agent-tools-op-name">{op.name}</code>
            <span className={`agent-tools-op-kind kind-${op.kind}`}>{op.kind}</span>
          </label>
          <button
            className="agent-tools-op-explain"
            aria-expanded={explain === op.name}
            aria-label={t("agentToolsExplainAria", { op: op.name })}
            onClick={() => onExplain(explain === op.name ? null : op.name)}
          >
            <Icon name="info" size={12} />
          </button>
          {explain === op.name && (
            <p className="agent-tools-op-explain-text">{opExplanation(op, t)}</p>
          )}
        </div>
      ))}
    </fieldset>
  );
}

/* The bound connection's real scopes + over-grant warning (UX5). Honest when live scopes aren't reported. */
function ScopeReadout({ scopes, t }: { scopes: ReturnType<typeof scopeReport>; t: T }): React.JSX.Element {
  return (
    <div className="agent-tools-scoperead">
      {!scopes.actualKnown ? (
        <p className="muted agent-tools-scope-unknown">
          {t("agentToolsScopesNeeded")}: {scopes.needed.map(scopeShort).join(", ") || t("agentToolsScopesNone")}
          <span className="agent-tools-scope-note"> · {t("agentToolsScopesLiveUnknown")}</span>
        </p>
      ) : (
        <>
          <p className="muted agent-tools-scope-actual">{t("agentToolsScopesActual")}: {scopes.actual.map(scopeShort).join(", ")}</p>
          {scopes.excess.length > 0 && (
            <p className="agent-tools-scope-excess" role="alert">
              <Icon name="alert" size={12} />{t("agentToolsScopeExcess", { scopes: scopes.excess.map(scopeShort).join(", ") })}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/* Grant a connector the model didn't suggest — a plain picker, still one deliberate human grant. */
function AddConnector({ tools, onGrant, t }: { tools: ToolDef[]; onGrant: (id: string, ops: string[]) => void; t: T }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <section className="agent-tools-add">
      <button className="btn ghost sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Icon name="plus" size={13} />{t("agentToolsAddConnector")}
      </button>
      {open && (
        <ul className="agent-tools-add-list">
          {tools.map((tl) => {
            const reads = tl.operations.filter((o) => !isMutating(o.kind)).map((o) => o.name);
            return (
              <li key={tl.id} className="agent-tools-add-row">
                <span className="agent-tools-add-name">{tl.name}<span className="muted"> · {tl.providerLabel}</span></span>
                <button className="btn sm" onClick={() => { onGrant(tl.id, reads.length ? [reads[0]] : [tl.operations[0]?.name].filter(Boolean) as string[]); setOpen(false); }} title={t("agentToolsAddHint")}>
                  {t("agentToolsGrantVerb")}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* The per-project "granted authority" audit view (UX4) — on demand, agent × connector × op × connection. */
function AuthorityView({ agents, connections, t }: { agents: AgentInput[]; connections: ConnectionStatus[]; t: T }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const rows = authorityLedger(agents, connections);
  return (
    <section className="agent-tools-authority">
      <button className="run-system-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Icon name={open ? "refresh" : "eye"} size={12} />{t("agentToolsAuthority", { n: rows.length })}
      </button>
      {open && (
        rows.length === 0 ? (
          <p className="muted agent-tools-authority-empty">{t("agentToolsAuthorityEmpty")}</p>
        ) : (
          <div className="agent-tools-authority-tablewrap">
            <table className="agent-tools-authority-table">
              <thead>
                <tr>
                  <th>{t("agentToolsAuthAgent")}</th><th>{t("agentToolsAuthConnector")}</th>
                  <th>{t("agentToolsAuthOp")}</th><th>{t("agentToolsAuthConnection")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.agentName}</td>
                    <td>{r.toolName}</td>
                    <td>
                      <code>{r.op}</code>
                      <span className={`agent-tools-op-kind kind-${r.kind}`}>{r.kind}</span>
                      {r.autonomous && isMutatingKind(r.kind) && <span className="agent-tools-auto-tag" title={t("agentToolsAutoTagHint")}>{t("agentToolsAutoTag")}</span>}
                    </td>
                    <td>
                      <span className={`agent-tools-auth-state rd-${r.readiness}`}>
                        <Icon name={r.readiness === "connected" ? "check" : r.readiness === "error" ? "alert" : "lock"} size={10} />
                        {r.readiness === "connected" ? t("agentToolsStateConnected") : r.readiness === "error" ? t("agentToolsStateError") : t("agentToolsStateGranted")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </section>
  );
}

function UnknownGrant({ toolId, onRevoke, t }: { toolId: string; onRevoke: () => void; t: T }): React.JSX.Element {
  return (
    <section className="agent-tools-grant unknown">
      <div className="agent-tools-grant-head">
        <span className="agent-tools-grant-name">{toolId}</span>
        <span className="agent-tools-badge rd-error"><Icon name="alert" size={11} />{t("agentToolsUnknown")}</span>
      </div>
      <p className="muted">{t("agentToolsUnknownHint")}</p>
      <button className="btn ghost sm agent-tools-revoke" onClick={onRevoke}><Icon name="x" size={12} />{t("agentToolsRevoke")}</button>
    </section>
  );
}

/* ── helpers ──────────────────────────────────────────────────────────────────────────────────────── */
function isMutatingKind(kind: string): boolean { return kind === "write" || kind === "send" || kind === "delete"; }

/** Shorten a scope URL to its last path segment for display (the full value is in the tooltip/model). */
function scopeShort(scope: string): string {
  const m = scope.replace(/\/$/, "").split("/").pop() || scope;
  return m;
}

/** The on-demand "what this lets the agent do" explanation — kind-driven, honest about blast radius. */
function opExplanation(op: ToolOperation, t: T): string {
  const inputs = op.input.map((i) => i.name).join(", ");
  return t(`agentToolsOpExplain_${op.kind}`, { op: op.name, inputs: inputs || "—" });
}
