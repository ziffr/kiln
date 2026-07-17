/**
 * The detail slide-in for a selected agent — the ONE right-side surface for everything about it, so the
 * Agents stage reads like every other stage (select → detail), instead of dumping every agent's full
 * spec inline. Modelled on AreaDetail/WorkflowDetail: same `nd` chrome, same close affordance, same
 * `detail-slide-in`.
 *
 * Three tabs, which are exactly the three honest questions about an agent:
 *   Contract  — what it MAY do. DERIVED from the model (golden invariant #2): read-only, badged.
 *   Behaviour — HOW it decides. AUTHORED (the system prompt) + its AI prompt-critique.
 *   Runs      — what it DID. The test loop + trace + history/compare (mock dispatch; badged simulated).
 *
 * Presentational: every mutation, the run, and persistence live in App.
 */

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { RunCompare } from "./RunCompare";
import { AgentTools, type AgentToolsProps } from "./AgentTools";
import { AGENT_RUN_HISTORY_MAX, diffWords } from "../runDiff";
import type { AgentContract, ToolSchema } from "@kiln/codegen";
import type { AgentInput, CapabilityDoc } from "@kiln/compiler";
import type { CritiqueFinding } from "@kiln/skills";
import type { RunTrace, RunStep } from "../projects";

type T = (k: string, o?: Record<string, unknown>) => string;
type Tab = "contract" | "behaviour" | "tools" | "runs";

/** Everything the Runs tab needs — the run itself is owned by App (fetch + persistence). */
export type AgentRunProps = {
  trace?: RunTrace;
  /** the agent's recent runs, NEWEST FIRST and bounded (AGENT_RUN_HISTORY_MAX). `history[0]` === `trace`. */
  history: RunTrace[];
  task: string;
  onTask: (v: string) => void;
  onRun: () => void;
  busy: boolean;
  error?: string | null;
  /** The engine (provider) + model the run will use — the SAME configured for generation (set in Settings). */
  engineLabel?: string;
  modelLabel?: string;
  /** SPEC-013 UX7 — the "run against the live connection" consent is armed (in the Tools tab). In B2 the
   *  run STILL dispatches mock; the badge is honest about that rather than pretending the run went live. */
  liveMode?: boolean;
};

/** A pending, human-gated revision proposal for this agent's behaviour — the diff the human accepts or
 *  rejects. Owned by App (the call + the write live there); AgentDetail only renders the gate. */
export type AgentRevision = {
  /** the findings this proposal addresses (one, or all of them via Apply all). */
  findings: CritiqueFinding[];
  /** the authored prompt as it stands (the diff's left side). */
  original: string;
  /** the proposal (the diff's right side). Guaranteed inside the agent's contract by the skill. */
  revised: string;
  /** the model's one-line account of what it changed. */
  note: string;
  /** false when the model judged no text change was needed — said plainly rather than faked as a diff. */
  changed: boolean;
  /** tools a first draft invented that the repair retry removed — surfaced, not hidden. */
  repairedTools: string[];
};

export function AgentDetail({
  agent, caps, contract, run, tools, locale, t,
  onEditInstructions, onReviewPrompt, reviewing, critique, onDismissFinding, onSelectFinding,
  onApplyFinding, applying, revision, onAcceptRevision, onRejectRevision, revisionError,
  onSelectCapability, onClose,
}: {
  agent: AgentInput;
  caps: CapabilityDoc;
  /** the DERIVED contract (input · tools · output · context) — a read-only projection of the model. */
  contract?: AgentContract;
  run: AgentRunProps;
  /** SPEC-013 Phase B2 — everything the Tools tab needs (grant/connect/readiness). Owned by App. */
  tools: AgentToolsProps;
  locale: string;
  t: T;
  /** persist an authored edit of the agent's behaviour (system prompt). */
  onEditInstructions?: (agentId: string, value: string) => void;
  /** critique this agent's prompt against its contract (advisory; the human applies or dismisses). */
  onReviewPrompt?: (agentId: string) => void;
  reviewing?: boolean;
  /** undefined = not reviewed, [] = reviewed-clean, >0 = advisory findings. */
  critique?: CritiqueFinding[];
  onDismissFinding?: (f: CritiqueFinding) => void;
  onSelectFinding?: (f: CritiqueFinding) => void;
  /** propose the smallest edit addressing `findings` (one, or all). Proposes only — never writes. */
  onApplyFinding?: (agentId: string, findings: CritiqueFinding[]) => void;
  applying?: boolean;
  /** the pending proposal awaiting the human's accept/reject. */
  revision?: AgentRevision;
  onAcceptRevision?: () => void;
  onRejectRevision?: () => void;
  revisionError?: string | null;
  onSelectCapability: (id: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const [tab, setTab] = useState<Tab>("contract");
  const designed = Boolean(agent.instructions?.trim());

  return (
    <div className="nd agent-detail">
      <div className="nd-head">
        <strong className="agent-title"><Icon name="bot" size={15} />{agent.name || agent.id}</strong>
        <button className="nd-close" onClick={onClose} aria-label={t("close")}><Icon name="x" size={15} /></button>
      </div>
      <div className="agent-detail-meta">
        {/* AG6: an agent with no authored behaviour is UNDESIGNED — say so wherever the agent is named. */}
        <span className={`agent-status ${designed ? "on" : "off"}`}>
          <Icon name={designed ? "check" : "alert"} size={11} />{designed ? t("agentDesigned") : t("agentNotDesigned")}
        </span>
      </div>
      {agent.goal && <p className="agent-detail-goal muted">{agent.goal}</p>}

      <div className="drawer-tabs agent-detail-tabs" role="tablist">
        {(["contract", "behaviour", "tools", "runs"] as Tab[]).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={`drawer-tab${tab === k ? " active" : ""}`}
            onClick={() => setTab(k)}
          >
            {t(k === "contract" ? "agentContract" : k === "behaviour" ? "agentTabBehaviour" : k === "tools" ? "agentTabTools" : "agentTabRuns")}
            {k === "tools" && (agent.grants?.length ?? 0) > 0 && <span className="agent-tab-count">{agent.grants!.length}</span>}
          </button>
        ))}
      </div>

      {tab === "contract" && <ContractTab agent={agent} caps={caps} contract={contract} onSelectCapability={onSelectCapability} t={t} />}
      {tab === "tools" && <AgentTools {...tools} />}
      {tab === "behaviour" && (
        <BehaviourTab
          agent={agent}
          onEditInstructions={onEditInstructions}
          onReviewPrompt={onReviewPrompt}
          reviewing={reviewing}
          critique={critique}
          onDismissFinding={onDismissFinding}
          onSelectFinding={onSelectFinding}
          onApplyFinding={onApplyFinding}
          applying={applying}
          revision={revision}
          onAcceptRevision={onAcceptRevision}
          onRejectRevision={onRejectRevision}
          revisionError={revisionError}
          t={t}
        />
      )}
      {tab === "runs" && <RunsTab run={run} locale={locale} t={t} />}
    </div>
  );
}

/* ── Contract: what the agent MAY do ──────────────────────────────────────────────────────────────
   A read-only four-quadrant spec (input · tools · output · context) DERIVED from the model (AgentsDoc +
   DomainDoc + TriggersDoc). A projection, not authored truth (golden invariant #2) — the system prompt in
   the Behaviour tab is grounded in exactly these facts. Not editable. */
function ContractTab({ agent, caps, contract, onSelectCapability, t }: {
  agent: AgentInput;
  caps: CapabilityDoc;
  contract?: AgentContract;
  onSelectCapability: (id: string) => void;
  t: T;
}): React.JSX.Element {
  const capName = (id: string): string => caps.capabilities.find((c) => c.id === id)?.name || id;
  const members = agent.capabilities ?? [];
  return (
    <div className="agent-tab">
      <div className="nd-row">
        <span className="nd-label">{t("capabilities")}</span>
        <div className="nd-chips">
          {members.length === 0 && <span className="muted">—</span>}
          {members.map((c) => (
            <button className="nd-chip clickable" key={c} onClick={() => onSelectCapability(c)}>{capName(c)}</button>
          ))}
        </div>
      </div>
      <AgentContractPanel contract={contract} t={t} />
    </div>
  );
}

/**
 * The named fields a contract tool TAKES, for the Tools quadrant — e.g. `find_lead · email, status` tells the
 * reader what the agent can look a record up BY, which is the whole point of a find tool (the alternative is
 * listing a table and scanning it). Reuses the ` · fields` idiom the Context quadrant already uses.
 *
 * The kind isn't in a `ToolSchema` (it's the provider-neutral shape sent to the model), so the SHAPE is the
 * discriminator — the same rule `agentToolParams` builds by: a command carries `id` among its properties, a
 * by-id read / notify declares `required`, a plain list has no properties. What's left — named, optional,
 * id-less params — is exactly the "call me with these fields" tools: `find_*` and external delegations.
 * Language-neutral (field names come from the model), so it reads the same in every locale.
 */
function toolFields(tool: ToolSchema): string {
  const schema = tool.input_schema as { properties?: Record<string, unknown>; required?: string[] };
  const fields = Object.keys(schema?.properties ?? {});
  if (!fields.length || schema.required?.length || fields.includes("id")) return "";
  return ` · ${fields.join(", ")}`;
}

function AgentContractPanel({ contract, t }: { contract?: AgentContract; t: T }): React.JSX.Element | null {
  if (!contract) return null;
  const input = contract.input.triggers.map((tr) => `${tr.name} (${tr.kind})`);
  const tools = contract.tools.map((tl) => `${tl.name}${toolFields(tl)}`);
  const output = [
    ...contract.output.events.map((e) => `▲ ${e}`),
    ...contract.output.recordChanges.map((r) => `✎ ${r}`),
  ];
  return (
    <div className="agent-contract" aria-label={t("agentContract")}>
      <div className="agent-contract-head">
        <span className="agent-contract-title"><Icon name="code" size={12} />{t("agentContract")}</span>
        <span className="agent-contract-derived" title={t("agentContractDerivedHint")}><Icon name="lock" size={11} />{t("agentContractDerived")}</span>
      </div>
      <div className="agent-contract-grid">
        <ContractQuadrant label={t("agentContractInput")} hint={t("agentContractInputHint")} items={input} empty={t("agentContractNoInput")} />
        <ContractQuadrant label={t("agentContractTools")} hint={t("agentContractToolsHint")} items={tools} empty={t("agentContractNoTools")} />
        <ContractQuadrant label={t("agentContractOutput")} hint={t("agentContractOutputHint")} items={output} empty={t("agentContractNoOutput")} />
        <div className="agent-contract-cell">
          <span className="agent-contract-cell-label">{t("agentContractContext")}</span>
          <span className="agent-contract-cell-hint muted">{t("agentContractContextHint")}</span>
          {contract.context.entities.length || contract.context.processes.length ? (
            <ul className="agent-contract-list">
              {contract.context.entities.map((e) => (
                <li key={e.name}>
                  <strong>{e.name}</strong>
                  {e.attributes.length > 0 && (
                    <span className="agent-contract-fields"> · {e.attributes.map((at) => (at.type ? `${at.name}:${at.type}` : at.name)).join(", ")}</span>
                  )}
                </li>
              ))}
              {contract.context.processes.map((p) => <li key={`proc-${p}`} className="agent-contract-proc">⟳ {p}</li>)}
            </ul>
          ) : (
            <span className="agent-contract-none muted">{t("agentContractNoContext")}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function ContractQuadrant({ label, hint, items, empty }: { label: string; hint: string; items: string[]; empty: string }): React.JSX.Element {
  return (
    <div className="agent-contract-cell">
      <span className="agent-contract-cell-label">{label}</span>
      <span className="agent-contract-cell-hint muted">{hint}</span>
      {items.length ? (
        <ul className="agent-contract-list">{items.map((it, i) => <li key={`${it}-${i}`}>{it}</li>)}</ul>
      ) : (
        <span className="agent-contract-none muted">{empty}</span>
      )}
    </div>
  );
}

/* ── Behaviour: HOW the agent decides ─────────────────────────────────────────────────────────────
   The AUTHORED system prompt. Empty means NOBODY HAS DESIGNED this agent — the note says so plainly and
   Kiln does NOT substitute a default playbook (a full template in a grey font makes an undesigned agent
   look designed). On export an empty prompt ships a TBD the runtime refuses. */
function BehaviourTab({ agent, onEditInstructions, onReviewPrompt, reviewing, critique, onDismissFinding, onSelectFinding, onApplyFinding, applying, revision, onAcceptRevision, onRejectRevision, revisionError, t }: {
  agent: AgentInput;
  onEditInstructions?: (agentId: string, value: string) => void;
  onReviewPrompt?: (agentId: string) => void;
  reviewing?: boolean;
  critique?: CritiqueFinding[];
  onDismissFinding?: (f: CritiqueFinding) => void;
  onSelectFinding?: (f: CritiqueFinding) => void;
  onApplyFinding?: (agentId: string, findings: CritiqueFinding[]) => void;
  applying?: boolean;
  revision?: AgentRevision;
  onAcceptRevision?: () => void;
  onRejectRevision?: () => void;
  revisionError?: string | null;
  t: T;
}): React.JSX.Element {
  const designed = Boolean(agent.instructions?.trim());
  // PR #54 held: an agent with NO authored behaviour has nothing to revise, and Apply must not become a
  // back door that synthesizes one (its single "not designed yet" finding stands). The gate is here as
  // well as in the skill — the button never appears, so the refusal isn't only a server-side error.
  const canApply = Boolean(onApplyFinding) && designed;
  return (
    <div className="agent-tab">
      <label className="agent-behaviour">
        <span className="agent-behaviour-label"><Icon name="code" size={12} />{t("agentBehaviour")}</span>
        {onEditInstructions ? (
          <textarea
            className="agent-behaviour-input"
            spellCheck={false}
            value={agent.instructions ?? ""}
            placeholder={t("agentBehaviourPlaceholder")}
            aria-label={t("agentBehaviour")}
            onChange={(e) => onEditInstructions(agent.id, e.target.value)}
          />
        ) : (
          <pre className="agent-behaviour-view">{agent.instructions?.trim() || ""}</pre>
        )}
        <span className={`agent-behaviour-note ${designed ? "muted" : "warn"}`}>
          {designed ? t("agentBehaviourAuthored") : t("agentBehaviourNone")}
        </span>
      </label>

      {onReviewPrompt && (
        <button className="btn ghost sm agent-review-btn" onClick={() => onReviewPrompt(agent.id)} disabled={reviewing} title={t("agentReviewPromptHint")}>
          <Icon name="sparkles" size={13} />{reviewing ? t("agentReviewPromptRunning") : t("agentReviewPrompt")}
        </button>
      )}
      <AgentPromptFindings
        findings={critique}
        onDismiss={onDismissFinding}
        onSelect={onSelectFinding}
        onApply={canApply ? (fs) => onApplyFinding?.(agent.id, fs) : undefined}
        applying={applying}
        t={t}
      />
      {revisionError && <p className="run-error agent-revision-error" role="alert"><Icon name="info" size={13} />{revisionError}</p>}
      {revision && (
        <RevisionDiff revision={revision} onAccept={onAcceptRevision} onReject={onRejectRevision} t={t} />
      )}
    </div>
  );
}

/**
 * The human gate: the proposed edit as a word-level diff, with Accept / Reject.
 *
 * The whole point of Apply is that the human still DECIDES — so the decision has to be cheap to make,
 * which means the change must be legible at a glance. Hence a word diff (reusing `diffWords`, the same
 * LCS the run-compare view uses) rather than an opaque "improved" prompt: strike-through is what the
 * model removed, highlight is what it added, and everything unmarked is the author's untouched text.
 * Nothing is written until Accept — Reject leaves the behaviour byte-identical.
 */
function RevisionDiff({ revision, onAccept, onReject, t }: {
  revision: AgentRevision;
  onAccept?: () => void;
  onReject?: () => void;
  t: T;
}): React.JSX.Element {
  const spans = revision.changed ? diffWords(revision.original, revision.revised) : [];
  return (
    <section className="agent-revision" aria-label={t("agentRevisionTitle")}>
      <div className="agent-revision-head">
        <span className="agent-revision-title"><Icon name="sparkles" size={12} />{t("agentRevisionTitle")}</span>
        <span className="agent-revision-legend muted">
          <span className="rc-del">{t("agentDiffOld")}</span>
          <span className="rc-ins">{t("agentDiffNew")}</span>
        </span>
      </div>
      <p className="agent-revision-lead muted">{t("agentRevisionLead")}</p>
      {revision.note && <p className="agent-revision-note">{revision.note}</p>}
      {/* The guard bit: a first draft invented a tool and was redone. Say so — a silent repair would hide
          that the model tried to exceed the contract. */}
      {revision.repairedTools.length > 0 && (
        <p className="agent-revision-warn"><Icon name="alert" size={12} />{t("agentRevisionRepaired", { tools: revision.repairedTools.join(", ") })}</p>
      )}
      {revision.changed ? (
        <p className="rc-diff agent-revision-diff">
          {spans.map((s, i) => (
            <span key={i} className={s.op === "add" ? "rc-ins" : s.op === "del" ? "rc-del" : undefined}>{s.text}</span>
          ))}
        </p>
      ) : (
        <p className="agent-revision-same muted">{t("agentRevisionNoChange")} {t("agentRevisionUnchangedHint")}</p>
      )}
      <div className="agent-revision-actions">
        {/* Accept is offered only when there IS a change to make — an unchanged proposal has nothing to
            write, so only Reject (dismiss) is honest. */}
        {revision.changed && onAccept && (
          <button className="btn primary sm" onClick={onAccept} title={t("agentRevisionAcceptHint")}>
            <Icon name="check" size={13} />{t("agentRevisionAccept")}
          </button>
        )}
        {onReject && (
          <button className="btn ghost sm" onClick={onReject} title={t("agentRevisionRejectHint")}>
            <Icon name="x" size={13} />{t("agentRevisionReject")}
          </button>
        )}
      </div>
    </section>
  );
}

// The agent's PROMPT-CRITIQUE findings — the same surface the per-layer AI review uses, rendered per
// agent. undefined = not yet reviewed (nothing shown); [] = reviewed clean; >0 = findings against the
// agent's real contract.
//
// Each finding offers Apply (propose the smallest edit addressing it) and dismiss. Apply is a PROPOSAL:
// it opens a diff the human accepts or rejects — the behaviour is authored IR and stays theirs (golden
// invariant #2). `onApply` is undefined for an undesigned agent (nothing to revise) — then the list is
// advisory-only, exactly as before.
function AgentPromptFindings({ findings, onDismiss, onSelect, onApply, applying, t }: {
  findings?: CritiqueFinding[];
  onDismiss?: (f: CritiqueFinding) => void;
  onSelect?: (f: CritiqueFinding) => void;
  onApply?: (findings: CritiqueFinding[]) => void;
  applying?: boolean;
  t: T;
}): React.JSX.Element | null {
  if (!findings) return null; // not reviewed → show nothing (the button is the entry point)
  return (
    <ul className="findings cap-findings critique-inline agent-prompt-findings">
      <li className="findings-head muted">
        <Icon name="sparkles" size={13} /> {t("agentReviewPromptTitle")}
        {/* Apply all: one call, one diff, one accept — for when the human agrees with the whole set.
            Only worth offering for more than one finding. */}
        {onApply && findings.length > 1 && (
          <button className="fi-apply fi-apply-all" onClick={() => onApply(findings)} disabled={applying} title={t("agentApplyAllHint")}>
            <Icon name="sparkles" size={11} />{applying ? t("agentApplyRunning") : t("agentApplyAll")}
          </button>
        )}
      </li>
      {findings.length === 0 && <li className="muted">{t("agentReviewPromptOk")}</li>}
      {findings.map((f) => (
        <li key={f.id} className={f.target && onSelect ? "clickable" : ""} onClick={() => f.target && onSelect?.(f)} title={f.target && onSelect ? t("findingGoHint") : undefined}>
          <span className="fi-text"><code className={f.severity === "concern" ? "major" : "minor"}>{t(`sev_${f.severity}`)}</code> {f.message}{f.suggestion ? ` → ${f.suggestion}` : ""}</span>
          {onApply && (
            <button className="fi-apply" disabled={applying} title={t("agentApplyFindingHint")} onClick={(e) => { e.stopPropagation(); onApply([f]); }}>
              {applying ? t("agentApplyRunning") : t("agentApplyFinding")}
            </button>
          )}
          {onDismiss && <button className="fi-dismiss" title={t("ignore")} aria-label={t("ignore")} onClick={(e) => { e.stopPropagation(); onDismiss(f); }}><Icon name="x" size={13} /></button>}
        </li>
      ))}
    </ul>
  );
}

/* ── Runs: what the agent DID ─────────────────────────────────────────────────────────────────────
   TESTS the agent against a task and shows the run-trace. The loop runs server-side with MOCK tool
   dispatch: nothing hits a real system, and every tool step is badged "simulated".

   The recent runs (bounded — newest first) sit behind an ON-DEMAND History disclosure: pick any past run
   to view, or open Compare to diff two of them. Nothing is shown until asked for. */
function formatWhen(at: number, locale: string): string {
  try { return new Date(at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }); } catch { return new Date(at).toLocaleString(); }
}
const pretty = (v: unknown): string => { try { return typeof v === "string" ? v : JSON.stringify(v, null, 2); } catch { return String(v); } };

function StepView({ step, t }: { step: RunStep; t: T }): React.JSX.Element {
  if (step.assistantText) {
    return (
      <div className="run-step run-assistant">
        <div className="run-step-head"><Icon name="bot" size={13} /><span>{t("agentRunAssistant")}</span></div>
        <p className="run-assistant-text">{step.assistantText}</p>
      </div>
    );
  }
  if (step.toolCall) {
    return (
      <div className="run-step run-tool">
        <div className="run-step-head">
          <Icon name="code" size={13} />
          <span className="run-tool-name">{step.toolCall.name}</span>
          {step.simulated && <span className="run-sim-badge" title={t("agentRunSimulatedHint")}>{t("agentRunSimulated")}</span>}
        </div>
        <div className="run-tool-io">
          <div className="run-io-block">
            <span className="run-io-label">{t("agentRunArgs")}</span>
            <pre>{pretty(step.toolCall.input)}</pre>
          </div>
          {step.toolResult && (
            <div className="run-io-block">
              <span className="run-io-label">{t("agentRunResult")}</span>
              <pre>{pretty(step.toolResult.output)}</pre>
            </div>
          )}
        </div>
      </div>
    );
  }
  return <></>;
}

function RunsTab({ run, locale, t }: { run: AgentRunProps; locale: string; t: T }): React.JSX.Element {
  const { trace, history, task, onTask, onRun, busy, error, engineLabel, modelLabel, liveMode } = run;
  const [showSystem, setShowSystem] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  // Which run of the history is on screen (0 = latest). A fresh run resets it — see below.
  const [viewIdx, setViewIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // A fresh trace snaps back to the latest run and scrolls the steps into view.
  useEffect(() => { if (trace) { setViewIdx(0); scrollRef.current?.scrollTo({ top: 0 }); } }, [trace]);

  // The run on screen: the picked history entry, else the last trace (history is empty on a pre-history project).
  const shown: RunTrace | undefined = history[viewIdx] ?? trace;
  const tokens = shown ? (shown.usage?.input ?? 0) + (shown.usage?.output ?? 0) : 0;
  const canCompare = history.length > 1;

  return (
    <div className="agent-tab agent-runs">
      <p className="run-lead muted">{t("agentRunLead")}</p>

      {engineLabel && (
        <p className="run-engine muted" title={t("agentRunEngineHint")}>
          <Icon name="settings" size={12} />
          {t("agentRunEngine", { engine: engineLabel, model: modelLabel ?? "" })}
        </p>
      )}

      <div className="run-input">
        <label className="run-task-label" htmlFor="agent-run-task">{t("agentRunTask")}</label>
        <textarea
          id="agent-run-task"
          className="run-task-input"
          rows={2}
          value={task}
          placeholder={t("agentRunTaskPlaceholder")}
          onChange={(e) => onTask(e.target.value)}
        />
        <button className="btn primary run-go" onClick={onRun} disabled={busy}>
          <Icon name={busy ? "refresh" : "play"} size={14} />{busy ? t("agentRunRunning") : t("agentRunGo")}
        </button>
      </div>

      {liveMode && (
        <p className="run-live-note" role="status"><Icon name="alert" size={13} />{t("agentRunLiveArmed")}</p>
      )}

      {error && <p className="run-error" role="alert"><Icon name="info" size={13} />{error}</p>}

      <div className="run-scroll" ref={scrollRef}>
        {shown ? (
          <>
            {/* On-demand: the recent runs + the compare. Only offered once there IS a history to look at. */}
            {history.length > 1 && (
              <div className="run-history-bar">
                <button className="run-hist-toggle" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
                  <Icon name="clock" size={12} />{t("agentRunHistory", { n: history.length })}
                </button>
                {canCompare && (
                  <button
                    className={`run-hist-toggle${showCompare ? " on" : ""}`}
                    onClick={() => setShowCompare((v) => !v)}
                    aria-expanded={showCompare}
                    title={t("runCompareHint")}
                  >
                    <Icon name="route" size={12} />{t("runCompare")}
                  </button>
                )}
              </div>
            )}

            {showHistory && history.length > 1 && (
              <ul className="run-history-list">
                {history.map((r, i) => (
                  <li key={i}>
                    <button
                      className={`run-hist-item${i === viewIdx ? " on" : ""}`}
                      onClick={() => setViewIdx(i)}
                      aria-current={i === viewIdx}
                    >
                      <span className="run-hist-n">#{history.length - i}</span>
                      <span className="run-hist-when">{formatWhen(r.at, locale)}</span>
                      {r.model && <span className="ps-tag">{r.model}</span>}
                      <span className="muted run-hist-meta">
                        {r.stepCount} {t("agentRunSteps")}
                        {typeof r.estCostUsd === "number" ? ` · $${r.estCostUsd.toFixed(4)}` : ""}
                      </span>
                      {i === 0 && <span className="run-hist-latest">{t("runCompareLatest")}</span>}
                    </button>
                  </li>
                ))}
                <li className="run-hist-cap muted">{t("agentRunHistoryCap", { n: AGENT_RUN_HISTORY_MAX })}</li>
              </ul>
            )}

            {showCompare && canCompare && (
              <RunCompare history={history} locale={locale} onClose={() => setShowCompare(false)} t={t} />
            )}

            <div className="run-totals">
              {viewIdx > 0 && <span className="run-hist-viewing">{t("agentRunViewing", { n: history.length - viewIdx })}</span>}
              <span className="run-total"><strong>{shown.stepCount}</strong> {t("agentRunSteps")}</span>
              <span className="run-total"><strong>{tokens}</strong> {t("tokens")}</span>
              {typeof shown.estCostUsd === "number" && <span className="run-total"><strong>${shown.estCostUsd.toFixed(4)}</strong></span>}
              {shown.model && <span className="ps-tag">{shown.model}</span>}
              <span className="run-sim-badge" title={t("agentRunSimulatedHint")}>{t("agentRunMockMode")}</span>
              <span className="muted run-when"><Icon name="clock" size={12} />{formatWhen(shown.at, locale)}</span>
            </div>

            <section className="ps-section run-system">
              <button className="run-system-toggle" onClick={() => setShowSystem((v) => !v)} aria-expanded={showSystem}>
                <Icon name={showSystem ? "refresh" : "code"} size={12} />{t("agentRunSystem")}
              </button>
              {showSystem && <pre className="run-system-pre">{shown.system}</pre>}
            </section>

            <section className="run-steps">
              {shown.steps.map((s, i) => <StepView key={i} step={s} t={t} />)}
            </section>

            <section className="ps-section run-final">
              <span className="ps-label">{t("agentRunFinal")}</span>
              <p className="run-final-text">{shown.finalText || t("agentRunNoFinal")}</p>
            </section>
          </>
        ) : (
          <p className="ps-empty muted">{t("agentRunEmpty")}</p>
        )}
      </div>
    </div>
  );
}
