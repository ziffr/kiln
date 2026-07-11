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
// `highlight` (an entity id, e.g. arrived-at via a cross-layer trace jump) glows its group.
export function BehaviourView({ domain, highlight, t }: { domain: DomainDoc; highlight?: string | null; t: T }): React.JSX.Element {
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
        <div key={agg} className={`behaviour-agg${agg === highlight ? " hot" : ""}`}>
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

// Automations → a bipartite wiring diagram: trigger events (left) curve to the commands they run
// (right). Reads at a glance which events drive which actions across entities.
export function AutomationsView({ domain, highlight, t }: { domain: DomainDoc; highlight?: string | null; t: T }): React.JSX.Element {
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
  const GAP = 54, PADY = 12, BOX_H = 34, COL_W = 190, GAP_X = 300;
  const H = Math.max(events.length, commands.length) * GAP + PADY;
  const cy = (i: number) => i * GAP + PADY + BOX_H / 2;
  const evY = Object.fromEntries(events.map((e, i) => [e, cy(i)]));
  const cmdY = Object.fromEntries(commands.map((c, i) => [c, cy(i)]));
  return (
    <div className="wiring" style={{ height: H, minWidth: GAP_X + COL_W }}>
      <svg className="wiring-svg" width={GAP_X + COL_W} height={H}>
        <defs><marker id="wire-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#94a3b8" /></marker></defs>
        {policies.map((p, i) => {
          const y1 = evY[p.on], y2 = cmdY[p.then], x1 = COL_W, x2 = GAP_X;
          const hot = highlight && (evAgg(p.on) === highlight || cmdAgg(p.then) === highlight);
          return <path key={i} d={`M ${x1} ${y1} C ${x1 + 70} ${y1}, ${x2 - 70} ${y2}, ${x2} ${y2}`} className={`wire${hot ? " hot" : ""}`} markerEnd="url(#wire-arrow)" />;
        })}
      </svg>
      {events.map((e, i) => <div key={e} className={`storm event wire-box${highlight && evAgg(e) === highlight ? " hot" : ""}`} style={{ top: i * GAP + PADY, left: 0, width: COL_W }}>{evName(e)}</div>)}
      {commands.map((c, i) => <div key={c} className={`storm command wire-box${highlight && cmdAgg(c) === highlight ? " hot" : ""}`} style={{ top: i * GAP + PADY, left: GAP_X, width: COL_W }}>{cmdName(c)}</div>)}
    </div>
  );
}

// Roles → a role × capability matrix. `highlightCap` glows the row for the arrived-at entity's owner.
export function RolesMatrix({ roles, caps, highlightCap, t }: { roles: RolesDoc; caps: CapabilityDoc; highlightCap?: string | null; t: T }): React.JSX.Element {
  if (!roles.roles.length) return <Empty msg={t("emptyRoles")} />;
  return (
    <div className="matrix-wrap">
      <table className="role-matrix">
        <thead><tr><th />{roles.roles.map((r) => <th key={r.id} className="rot">{r.name || r.id}</th>)}</tr></thead>
        <tbody>
          {caps.capabilities.map((c) => (
            <tr key={c.id} className={c.id === highlightCap ? "hot" : ""}>
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

// Workflows → a numbered left-to-right sequence: each step is a command, connected by arrows.
export function WorkflowsView({ workflows, domain, t }: { workflows: WorkflowsDoc; domain: DomainDoc; t: T }): React.JSX.Element {
  if (!workflows.workflows.length) return <Empty msg={t("emptyWorkflows")} />;
  const cmdName = (id: string) => (domain.commands ?? []).find((c) => c.id === id)?.name || id;
  return (
    <div className="workflows-view">
      {workflows.workflows.map((w) => (
        <div key={w.id} className="workflow-card">
          <div className="workflow-name">{w.name || w.id}</div>
          <div className="wf-seq">
            {(w.steps ?? []).map((s, i) => (
              <div key={i} className="wf-node">
                {i > 0 && <span className="wf-conn" aria-hidden />}
                <span className="wf-num">{i + 1}</span>
                <span className="wf-box">{cmdName(s)}</span>
              </div>
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
