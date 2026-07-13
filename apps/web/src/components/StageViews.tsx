// A distinct visualization per layer — each business concept gets the shape that fits it, instead of
// forcing everything through one graph. Compact by design; the map stays for capabilities/areas.

import { useState } from "react";
import { attributeSpecs, type CapabilityDoc, type DomainDoc, type RolesDoc, type WorkflowsDoc, type AgentsDoc, type ContextsDoc } from "@kiln/compiler";
import { Icon, type IconName } from "./Icon";

type T = (k: string, o?: Record<string, unknown>) => string;
const capName = (caps: CapabilityDoc, id: string): string => caps.capabilities.find((c) => c.id === id)?.name || id;

function Empty({ msg }: { msg: string }): React.JSX.Element {
  return <div className="stage-empty">{msg}</div>;
}

// Entities → cards grouped by owning capability, showing typed fields + references.
export function EntitiesView({ domain, caps, onSelect, t }: { domain: DomainDoc; caps: CapabilityDoc; onSelect: (id: string) => void; t: T }): React.JSX.Element {
  if (!domain.aggregates.length) return <Empty msg={t("emptyEntities")} />;
  return (
    <div className="cards">
      {domain.aggregates.map((a) => (
        <div key={a.id} className="entity-card" onClick={() => onSelect(a.owner)}>
          <div className="entity-card-head"><strong>{a.name || a.id}</strong><span className="muted">{capName(caps, a.owner)}</span></div>
          <ul className="entity-fields">
            {attributeSpecs(a).map((f) => (
              <li key={f.name}><span>{f.name}</span><code className="ftype">{f.type || "text"}</code></li>
            ))}
            {attributeSpecs(a).length === 0 && <li className="muted">{t("noFields")}</li>}
          </ul>
          {(a.references ?? []).length > 0 && <div className="entity-refs muted">→ {(a.references ?? []).join(", ")}</div>}
        </div>
      ))}
    </div>
  );
}

// Behaviour → event-storming style: per entity, commands (blue) emit events (orange).
// `highlight` (an entity id, e.g. arrived-at via a cross-layer trace jump) glows its group.
export function BehaviourView({ domain, highlight, highlightId, t }: { domain: DomainDoc; highlight?: string | null; highlightId?: string | null; t: T }): React.JSX.Element {
  const commands = domain.commands ?? [];
  const events = domain.events ?? [];
  if (!commands.length && !events.length) return <Empty msg={t("emptyBehaviour")} />;
  const byAgg = new Map<string, { cmds: typeof commands; evs: typeof events }>();
  for (const a of domain.aggregates) byAgg.set(a.id, { cmds: [], evs: [] });
  for (const c of commands) (byAgg.get(c.aggregate) ?? byAgg.set(c.aggregate, { cmds: [], evs: [] }).get(c.aggregate)!).cmds.push(c);
  for (const e of events) (byAgg.get(e.aggregate) ?? byAgg.set(e.aggregate, { cmds: [], evs: [] }).get(e.aggregate)!).evs.push(e);
  return (
    <div className="behaviour-view">
      {[...byAgg].filter(([, v]) => v.cmds.length || v.evs.length).map(([agg, v]) => (
        <div key={agg} className={`behaviour-agg${agg === highlight || agg === highlightId ? " hot" : ""}`}>
          <div className="behaviour-agg-name">{domain.aggregates.find((a) => a.id === agg)?.name || agg}</div>
          <div className="behaviour-flow">
            {v.cmds.map((c) => (
              <div key={c.id} className="storm-row">
                <span className={`storm command${c.id === highlightId ? " hot" : ""}`}>{c.name}</span>
                {(c.emits ?? []).length > 0 && <span className="storm-arrow">→</span>}
                {(c.emits ?? []).map((ev) => <span key={ev} className={`storm event${ev === highlightId ? " hot" : ""}`}>{events.find((e) => e.id === ev)?.name || ev}</span>)}
              </div>
            ))}
            {v.evs.filter((e) => (e.trigger ?? "command") !== "command").map((e) => (
              <div key={e.id} className="storm-row"><span className={`storm event trig-${e.trigger}${e.id === highlightId ? " hot" : ""}`}>{e.name}</span><span className="muted storm-trig">{t(`trigger_${e.trigger}`)}</span></div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Automations → a bipartite wiring diagram: trigger events (left) curve to the commands they run
// (right). Reads at a glance which events drive which actions across entities.
export function AutomationsView({ domain, highlight, highlightId, t }: { domain: DomainDoc; highlight?: string | null; highlightId?: string | null; t: T }): React.JSX.Element {
  const policies = domain.policies ?? [];
  const evName = (id: string) => (domain.events ?? []).find((e) => e.id === id)?.name || id;
  const cmdName = (id: string) => (domain.commands ?? []).find((c) => c.id === id)?.name || id;
  if (!policies.length) return <Empty msg={t("emptyAutomations")} />;
  // Which events/commands belong to the highlighted entity (arrived-at via a trace jump) — used to
  // glow the boxes it touches and the wires crossing into/out of it.
  const evAgg = (id: string) => (domain.events ?? []).find((e) => e.id === id)?.aggregate;
  const cmdAgg = (id: string) => (domain.commands ?? []).find((c) => c.id === id)?.aggregate;
  const events = [...new Set(policies.map((p) => p.on))];
  const commands = [...new Set(policies.map((p) => p.then))];
  // A policy IS a wire (event → command); when a policy finding is highlighted, glow its wire and the
  // two boxes it connects (policies have no box of their own).
  const hotPolicy = policies.find((p) => p.id === highlightId);
  const hotEvent = hotPolicy?.on, hotCmd = hotPolicy?.then;
  const GAP = 54, PADY = 12, BOX_H = 34, COL_W = 190, GAP_X = 300;
  const H = Math.max(events.length, commands.length) * GAP + PADY;
  const cy = (i: number) => i * GAP + PADY + BOX_H / 2;
  const evY = Object.fromEntries(events.map((e, i) => [e, cy(i)]));
  const cmdY = Object.fromEntries(commands.map((c, i) => [c, cy(i)]));
  return (
    <div className="wiring" style={{ height: H, minWidth: GAP_X + COL_W }}>
      <svg className="wiring-svg" width={GAP_X + COL_W} height={H}>
        <defs><marker id="wire-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke" /></marker></defs>
        {policies.map((p, i) => {
          const y1 = evY[p.on], y2 = cmdY[p.then], x1 = COL_W, x2 = GAP_X;
          const hot = (highlight && (evAgg(p.on) === highlight || cmdAgg(p.then) === highlight)) || p.id === highlightId;
          return <path key={i} d={`M ${x1} ${y1} C ${x1 + 70} ${y1}, ${x2 - 70} ${y2}, ${x2} ${y2}`} className={`wire${hot ? " hot" : ""}`} markerEnd="url(#wire-arrow)" />;
        })}
      </svg>
      {events.map((e, i) => <div key={e} className={`storm event wire-box${(highlight && evAgg(e) === highlight) || e === highlightId || e === hotEvent ? " hot" : ""}`} style={{ top: i * GAP + PADY, left: 0, width: COL_W }}>{evName(e)}</div>)}
      {commands.map((c, i) => <div key={c} className={`storm command wire-box${(highlight && cmdAgg(c) === highlight) || c === highlightId || c === hotCmd ? " hot" : ""}`} style={{ top: i * GAP + PADY, left: GAP_X, width: COL_W }}>{cmdName(c)}</div>)}
    </div>
  );
}

// Roles → a role × capability matrix. `highlightCap` glows the row for the arrived-at entity's owner.
export function RolesMatrix({ roles, caps, highlightCap, highlightId, t }: { roles: RolesDoc; caps: CapabilityDoc; highlightCap?: string | null; highlightId?: string | null; t: T }): React.JSX.Element {
  if (!roles.roles.length) return <Empty msg={t("emptyRoles")} />;
  return (
    <div className="matrix-wrap">
      <table className="role-matrix">
        <thead><tr><th className="matrix-corner" />{roles.roles.map((r) => <th key={r.id} className={`rot${r.id === highlightId ? " hot-col" : ""}`}><span>{r.name || r.id}</span></th>)}</tr></thead>
        <tbody>
          {caps.capabilities.map((c) => (
            <tr key={c.id} className={c.id === highlightCap ? "hot" : ""}>
              <td className="matrix-cap">{c.name}</td>
              {roles.roles.map((r) => (
                <td key={r.id} className={`matrix-cell${r.id === highlightId ? " hot-col" : ""}`}>{(r.capabilities ?? []).includes(c.id) ? <span className="matrix-yes">●</span> : ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Workflows → the routing review (SPEC-009): each process shows its numbered command sequence AND a
// workflow-vs-agent toggle. The decision (a fixed n8n pipeline vs. an agent running it by judgement)
// is the model's source of truth (WorkflowInput.mode) and drives what codegen emits. The LLM proposes;
// the human confirms/flips here.
type ProcessMode = "workflow" | "agent" | "external";
const MODE_ICON: Record<ProcessMode, IconName> = { workflow: "route", agent: "bot", external: "globe" };
const MODE_KEY: Record<ProcessMode, string> = { workflow: "modeWorkflow", agent: "modeAgent", external: "modeExternal" };

export function WorkflowsView({
  workflows,
  domain,
  t,
  onSetMode,
  onSetService,
  onBindStep,
  onClassify,
  classifyBusy,
  rationales,
  services,
}: {
  workflows: WorkflowsDoc;
  domain: DomainDoc;
  t: T;
  onSetMode?: (id: string, mode: ProcessMode) => void;
  onSetService?: (id: string, serviceId: string) => void;
  onBindStep?: (workflowId: string, step: string, serviceId: string) => void;
  onClassify?: () => void;
  classifyBusy?: boolean;
  rationales?: Record<string, string>;
  services?: Array<{ id: string; name: string; invocation: string }>;
}): React.JSX.Element {
  const [openDelegate, setOpenDelegate] = useState<string | null>(null);
  if (!workflows.workflows.length) return <Empty msg={t("emptyWorkflows")} />;
  const cmdName = (id: string) => (domain.commands ?? []).find((c) => c.id === id)?.name || id;
  const svcName = (id?: string) => services?.find((s) => s.id === id)?.name;
  return (
    <div className="workflows-view">
      <div className="wf-orch-head">
        <span className="muted">{t("orchestrationHint")}</span>
        {onClassify && (
          <button className="btn-secondary" onClick={onClassify} disabled={classifyBusy}>
            {classifyBusy ? t("classifying") : t("classifyBtn")}
          </button>
        )}
      </div>
      {workflows.workflows.map((w) => {
        const mode = (w.mode ?? "workflow") as ProcessMode;
        const rationale = rationales?.[w.id];
        return (
          <div key={w.id} className={`workflow-card wf-mode-${mode}`}>
            <div className="wf-card-head">
              <div className="workflow-name">{w.name || w.id}</div>
              {onSetMode ? (
                <div className="wf-mode-toggle" role="group" aria-label={t("runAs")}>
                  <span className="muted wf-mode-label">{t("runAs")}</span>
                  {(["workflow", "agent", "external"] as const).map((m) => (
                    <button key={m} className={`wf-mode-btn${mode === m ? " active" : ""}`} aria-pressed={mode === m} onClick={() => onSetMode(w.id, m)}>
                      <Icon name={MODE_ICON[m]} size={13} />
                      {t(MODE_KEY[m])}
                    </button>
                  ))}
                </div>
              ) : (
                <span className={`wf-mode-chip wf-mode-${mode}`}><Icon name={MODE_ICON[mode]} size={12} />{t(MODE_KEY[mode])}</span>
              )}
            </div>
            {rationale && <p className="wf-rationale muted">{rationale}</p>}
            <div className="wf-seq">
              {(w.steps ?? []).map((s, i) => {
                const boundTo = w.stepBindings?.[s];
                return (
                  <div key={i} className="wf-node">
                    {i > 0 && <span className="wf-conn" aria-hidden />}
                    <span className="wf-num">{i + 1}</span>
                    <span className={`wf-box${boundTo ? " wf-box-ext" : ""}`} title={boundTo ? `→ ${svcName(boundTo) ?? boundTo}` : undefined}>
                      {boundTo && "🌐 "}
                      {cmdName(s)}
                    </span>
                  </div>
                );
              })}
              {(w.steps ?? []).length === 0 && <span className="muted">{t("noSteps")}</span>}
            </div>
            {mode === "agent" && <p className="wf-mode-note">{t("agentFold")}</p>}
            {mode === "workflow" && onBindStep && services?.length ? (
              <div className="wf-delegate">
                <button className="wf-delegate-toggle" onClick={() => setOpenDelegate(openDelegate === w.id ? null : w.id)}>
                  {openDelegate === w.id ? "▾ " : "▸ "}
                  {t("delegateSteps")}
                </button>
                {openDelegate === w.id && (
                  <div className="wf-delegate-panel">
                    {(w.steps ?? []).map((s, i) => (
                      <div key={i} className="wf-delegate-row">
                        <span className="wf-delegate-step">{i + 1}. {cmdName(s)}</span>
                        <select value={w.stepBindings?.[s] ?? ""} onChange={(e) => onBindStep(w.id, s, e.target.value)}>
                          <option value="">{t("stepInternal")}</option>
                          {services.map((sv) => (
                            <option key={sv.id} value={sv.id}>🌐 {sv.name} ({sv.invocation})</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
            {mode === "external" && (
              <div className="wf-mode-note wf-ext-pick">
                <span>{t("externalDelegate")}</span>
                {onSetService && (services?.length ? (
                  <select value={w.service ?? ""} onChange={(e) => onSetService(w.id, e.target.value)}>
                    <option value="">{t("pickService")}</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.invocation})</option>
                    ))}
                  </select>
                ) : (
                  <em className="muted">{t("noServices")}</em>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Agents → cards: goal + operated capabilities.
export function AgentsView({ agents, caps, t }: { agents: AgentsDoc; caps: CapabilityDoc; t: T }): React.JSX.Element {
  if (!agents.agents.length) return <Empty msg={t("emptyAgents")} />;
  return (
    <div className="cards">
      {agents.agents.map((a) => (
        <div key={a.id} className="agent-card">
          <div className="entity-card-head"><strong className="agent-title"><Icon name="bot" size={15} />{a.name || a.id}</strong></div>
          {a.goal && <p className="agent-goal">{a.goal}</p>}
          <div className="agent-caps">{(a.capabilities ?? []).map((c) => <span key={c} className="wf-chip">{capName(caps, c)}</span>)}</div>
        </div>
      ))}
    </div>
  );
}

// Areas → the capability partition as colored groups (a cleaner read than the map backdrop).
export function AreasView({ contexts, caps, colors, onSelectArea, t }: { contexts: ContextsDoc; caps: CapabilityDoc; colors: string[]; onSelectArea: (id: string) => void; t: T }): React.JSX.Element {
  if (!contexts.contexts.length) return <Empty msg={t("emptyAreas")} />;
  return (
    <div className="cards">
      {contexts.contexts.map((c, i) => (
        <div key={c.id} className="area-card" style={{ ["--area-color" as string]: colors[i % colors.length] }} onClick={() => onSelectArea(c.id)}>
          <div className="area-card-head"><span className="area-dot" /><strong>{c.name || c.id}</strong></div>
          {c.intent && <p className="muted">{c.intent}</p>}
          <div className="agent-caps">{(c.capabilities ?? []).map((m) => <span key={m} className="wf-chip">{capName(caps, m)}</span>)}</div>
        </div>
      ))}
    </div>
  );
}
