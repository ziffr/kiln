// A distinct visualization per layer — each business concept gets the shape that fits it, instead of
// forcing everything through one graph. Compact by design; the map stays for capabilities/areas.

import { attributeSpecs, type CapabilityDoc, type DomainDoc, type RolesDoc, type WorkflowsDoc, type AgentsDoc, type ContextsDoc } from "@vbd/compiler";

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
export function BehaviourView({ domain, t }: { domain: DomainDoc; t: T }): React.JSX.Element {
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
        <div key={agg} className="behaviour-agg">
          <div className="behaviour-agg-name">{domain.aggregates.find((a) => a.id === agg)?.name || agg}</div>
          <div className="behaviour-flow">
            {v.cmds.map((c) => (
              <div key={c.id} className="storm-row">
                <span className="storm command">{c.name}</span>
                {(c.emits ?? []).length > 0 && <span className="storm-arrow">→</span>}
                {(c.emits ?? []).map((ev) => <span key={ev} className="storm event">{events.find((e) => e.id === ev)?.name || ev}</span>)}
              </div>
            ))}
            {v.evs.filter((e) => (e.trigger ?? "command") !== "command").map((e) => (
              <div key={e.id} className="storm-row"><span className={`storm event trig-${e.trigger}`}>{e.name}</span><span className="muted storm-trig">{t(`trigger_${e.trigger}`)}</span></div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Automations → reaction wiring: on <event> then <command>.
export function AutomationsView({ domain, t }: { domain: DomainDoc; t: T }): React.JSX.Element {
  const policies = domain.policies ?? [];
  const evName = (id: string) => (domain.events ?? []).find((e) => e.id === id)?.name || id;
  const cmdName = (id: string) => (domain.commands ?? []).find((c) => c.id === id)?.name || id;
  if (!policies.length) return <Empty msg={t("emptyAutomations")} />;
  return (
    <div className="automations-view">
      {policies.map((p, i) => (
        <div key={i} className="reaction-row">
          <span className="muted">{p.name}</span>
          <div className="reaction-wire">
            <span className="storm event">{evName(p.on)}</span>
            <span className="storm-arrow">⟶ {t("thenRun")} ⟶</span>
            <span className="storm command">{cmdName(p.then)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Roles → a role × capability matrix.
export function RolesMatrix({ roles, caps, t }: { roles: RolesDoc; caps: CapabilityDoc; t: T }): React.JSX.Element {
  if (!roles.roles.length) return <Empty msg={t("emptyRoles")} />;
  return (
    <div className="matrix-wrap">
      <table className="role-matrix">
        <thead><tr><th /> {roles.roles.map((r) => <th key={r.id} className="rot">{r.name || r.id}</th>)}</tr></thead>
        <tbody>
          {caps.capabilities.map((c) => (
            <tr key={c.id}>
              <td className="matrix-cap">{c.name}</td>
              {roles.roles.map((r) => (
                <td key={r.id} className="matrix-cell">{(r.capabilities ?? []).includes(c.id) ? <span className="matrix-yes">●</span> : ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Workflows → ordered step sequences (command chips).
export function WorkflowsView({ workflows, domain, t }: { workflows: WorkflowsDoc; domain: DomainDoc; t: T }): React.JSX.Element {
  if (!workflows.workflows.length) return <Empty msg={t("emptyWorkflows")} />;
  const cmdName = (id: string) => (domain.commands ?? []).find((c) => c.id === id)?.name || id;
  return (
    <div className="workflows-view">
      {workflows.workflows.map((w) => (
        <div key={w.id} className="workflow-card">
          <div className="workflow-name">{w.name || w.id}</div>
          <div className="workflow-steps">
            {(w.steps ?? []).map((s, i) => (
              <span key={i} className="wf-step">{i > 0 && <span className="wf-sep">→</span>}<span className="wf-chip">{cmdName(s)}</span></span>
            ))}
            {(w.steps ?? []).length === 0 && <span className="muted">{t("noSteps")}</span>}
          </div>
        </div>
      ))}
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
          <div className="entity-card-head"><strong>🤖 {a.name || a.id}</strong></div>
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
