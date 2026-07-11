// Entity-centric cross-layer trace: pick an entity and see how it connects across the whole model —
// the commands that change its state, the events those emit, the automations that react (and the
// downstream commands they run, often on OTHER entities), the roles that operate it, and the related
// entities it references / is referenced by. The one place the siloed layers are wired together.

import { attributeSpecs, type CapabilityDoc, type DomainDoc, type RolesDoc, type AggregateInput } from "@vbd/compiler";

type T = (k: string, o?: Record<string, unknown>) => string;

export function EntityTrace({ entity, domain, caps, roles, onSelectCap, onSelectEntity, onClose, t }: {
  entity: AggregateInput; domain: DomainDoc; caps: CapabilityDoc; roles: RolesDoc;
  onSelectCap: (id: string) => void; onSelectEntity: (id: string) => void; onClose: () => void; t: T;
}): React.JSX.Element {
  const capName = (id: string) => caps.capabilities.find((c) => c.id === id)?.name || id;
  const evName = (id: string) => (domain.events ?? []).find((e) => e.id === id)?.name || id;
  const cmdName = (id: string) => (domain.commands ?? []).find((c) => c.id === id)?.name || id;
  const cmdEntity = (id: string) => (domain.commands ?? []).find((c) => c.id === id)?.aggregate;
  const entName = (id: string) => domain.aggregates.find((a) => a.id === id)?.name || id;

  const commands = (domain.commands ?? []).filter((c) => c.aggregate === entity.id);
  const emitted = new Set(commands.flatMap((c) => c.emits ?? []));
  const reactions = (domain.policies ?? []).filter((p) => emitted.has(p.on)); // its events trigger these
  const triggeredBy = (domain.policies ?? []).filter((p) => commands.some((c) => c.id === p.then)); // these run its commands
  const opRoles = (roles.roles ?? []).filter((r) => (r.capabilities ?? []).includes(entity.owner));
  const refsOut = (entity.references ?? []).filter((r) => domain.aggregates.some((a) => a.id === r));
  const refsIn = domain.aggregates.filter((a) => (a.references ?? []).includes(entity.id)).map((a) => a.id);

  return (
    <div className="trace">
      <div className="nd-head">
        <h3>{entity.name || entity.id}</h3>
        <button className="nd-close" onClick={onClose} aria-label="close">×</button>
      </div>
      <button className="trace-owner" onClick={() => onSelectCap(entity.owner)}>
        {t("traceOwner")}: {capName(entity.owner)} · {attributeSpecs(entity).length} {t("attributes")}
      </button>

      <section className="trace-sec">
        <h4>{t("traceStateChanges")}</h4>
        {commands.length === 0 && <p className="muted">{t("traceNoBehaviour")}</p>}
        {commands.map((c) => (
          <div key={c.id} className="trace-row">
            <span className="storm command">{c.name}</span>
            {(c.emits ?? []).map((e) => (<span key={e} className="trace-emit"><span className="storm-arrow">→</span><span className="storm event">{evName(e)}</span></span>))}
          </div>
        ))}
      </section>

      {reactions.length > 0 && (
        <section className="trace-sec">
          <h4>{t("traceReacts")}</h4>
          {reactions.map((p, i) => (
            <div key={i} className="trace-row">
              <span className="storm event">{evName(p.on)}</span><span className="storm-arrow">⟶</span>
              <button className="storm command clickable" onClick={() => { const e = cmdEntity(p.then); if (e) onSelectEntity(e); }}>{cmdName(p.then)}</button>
              {cmdEntity(p.then) && cmdEntity(p.then) !== entity.id && <span className="trace-cross">↗ {entName(cmdEntity(p.then)!)}</span>}
            </div>
          ))}
        </section>
      )}

      {triggeredBy.length > 0 && (
        <section className="trace-sec">
          <h4>{t("traceTriggeredBy")}</h4>
          {triggeredBy.map((p, i) => <div key={i} className="trace-row"><span className="storm event">{evName(p.on)}</span><span className="storm-arrow">⟶</span><span className="storm command">{cmdName(p.then)}</span></div>)}
        </section>
      )}

      {opRoles.length > 0 && (
        <section className="trace-sec">
          <h4>{t("traceRoles")}</h4>
          <div className="agent-caps">{opRoles.map((r) => <span key={r.id} className="wf-chip">{r.name || r.id}</span>)}</div>
        </section>
      )}

      {(refsOut.length > 0 || refsIn.length > 0) && (
        <section className="trace-sec">
          <h4>{t("traceRelated")}</h4>
          <div className="trace-refs">
            {refsOut.map((id) => <button key={`o${id}`} className="trace-ref" onClick={() => onSelectEntity(id)}>→ {entName(id)}</button>)}
            {refsIn.map((id) => <button key={`i${id}`} className="trace-ref in" onClick={() => onSelectEntity(id)}>← {entName(id)}</button>)}
          </div>
        </section>
      )}
    </div>
  );
}
