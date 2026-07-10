import { useState } from "react";
import { useTranslation } from "react-i18next";
import { attributeSpecs, type AggregateInput, type AttributeSpec, type AttrType, type CapabilityDoc, type CapabilityInput, type CommandInput, type EventInput, type PolicyInput } from "@vbd/compiler";

const ATTR_TYPES: AttrType[] = ["text", "number", "boolean", "date", "money", "reference"];

/** Editor for an entity's typed attributes (RES-001: types make codegen emit real schemas). */
function AttributeList({ specs, onChange }: { specs: AttributeSpec[]; onChange: (next: AttributeSpec[]) => void }): React.JSX.Element {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const add = (): void => {
    const n = draft.trim();
    if (n && !specs.some((s) => s.name === n)) onChange([...specs, { name: n, type: "text" }]);
    setDraft("");
  };
  return (
    <div className="nd-row">
      <span className="nd-label">{t("attributes")}</span>
      <div className="nd-attrs">
        {specs.map((s, i) => (
          <div className="nd-attr" key={i}>
            <input
              className="nd-attr-name"
              value={s.name}
              onChange={(e) => onChange(specs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <select
              className="nd-attr-type"
              value={s.type ?? ""}
              onChange={(e) => onChange(specs.map((x, j) => (j === i ? { ...x, type: (e.target.value || undefined) as AttrType | undefined } : x)))}
            >
              <option value="">—</option>
              {ATTR_TYPES.map((tp) => <option key={tp} value={tp}>{t(`attrType_${tp}`)}</option>)}
            </select>
            <button className="chip-x" onClick={() => onChange(specs.filter((_, j) => j !== i))} aria-label="remove attribute">×</button>
          </div>
        ))}
      </div>
      <input
        className="nd-tag-input"
        value={draft}
        placeholder={t("addTag")}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
    </div>
  );
}

/**
 * Node detail — an editable capability FORM (SPEC-001 §7.5; REV-004 F1: structured forms, not
 * raw YAML). Editing writes back a new CapabilityInput; the App recompiles the IR so the map and
 * validators update live. Text-only rendering (no dangerouslySetInnerHTML) per REV-005 F4.
 */

function TagList({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const add = (): void => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft("");
  };
  return (
    <div className="nd-row">
      <span className="nd-label">{label}</span>
      <div className="nd-chips">
        {values.map((v) => (
          <span className="nd-chip" key={v}>
            {v}
            <button className="chip-x" onClick={() => onChange(values.filter((x) => x !== v))} aria-label="remove">×</button>
          </span>
        ))}
      </div>
      <input
        className="nd-tag-input"
        value={draft}
        placeholder={t("addTag")}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
    </div>
  );
}

/**
 * An entity's behaviour (SPEC-004) — collapsed "What happens" (REV-021 F1: hierarchical disclosure).
 * Business language: "Actions" (commands) → the "what happens" (events they emit). Read-only.
 */
function EntityBehaviour({
  commands,
  events,
  policies,
  allCommands,
}: {
  commands: CommandInput[];
  events: EventInput[];
  policies: PolicyInput[];
  allCommands: CommandInput[];
}): React.JSX.Element | null {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (commands.length === 0 && events.length === 0) return null;
  const eventName = (id: string): string => events.find((e) => e.id === id)?.name ?? id;
  const cmdName = (id: string): string => allCommands.find((c) => c.id === id)?.name ?? id;
  const cmdEntity = (id: string): string | undefined => allCommands.find((c) => c.id === id)?.aggregate;
  const standalone = events.filter((e) => (e.trigger ?? "command") !== "command");
  // Reactions triggered by THIS entity's events (SPEC-005) — the cross-entity hand-off, shown here.
  const reactionsFor = (eventId: string): PolicyInput[] => policies.filter((p) => p.on === eventId);
  return (
    <div className="nd-behaviour">
      <button className="nd-behaviour-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? "▾" : "▸"} {t("whatHappens")} <span className="muted">({commands.length})</span>
      </button>
      {open && (
        <div className="nd-behaviour-body">
          {commands.map((c) => (
            <div className="nd-action" key={c.id}>
              <span className="nd-action-name">{c.name}</span>
              {(c.emits ?? []).length > 0 && (
                <span className="nd-action-emits">→ {(c.emits ?? []).map(eventName).join(", ")}</span>
              )}
            </div>
          ))}
          {events.map((e) =>
            reactionsFor(e.id).map((p) => (
              <div className="nd-action nd-reaction" key={p.id}>
                <span className="nd-action-emits">⇒ {t("whenThen", { when: e.name, then: cmdName(p.then) })}</span>
                {cmdEntity(p.then) && <span className="muted"> ({cmdEntity(p.then)})</span>}
              </div>
            )),
          )}
          {standalone.map((e) => (
            <div className="nd-action" key={e.id}>
              <span className="nd-action-emits">⚡ {e.name} <span className="muted">({t(`trigger_${e.trigger}`)})</span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function NodeDetail({
  doc,
  aggregates = [],
  commands = [],
  events = [],
  policies = [],
  areas = [],
  capAreaId,
  onReassignArea,
  selectedId,
  onEdit,
  onDelete,
  onEditAggregate,
  onDeleteAggregate,
  onAddAggregate,
  onClose,
}: {
  doc: CapabilityDoc;
  aggregates?: AggregateInput[];
  commands?: CommandInput[];
  events?: EventInput[];
  policies?: PolicyInput[];
  areas?: { id: string; name: string }[];
  capAreaId?: string;
  onReassignArea?: (capId: string, areaId: string) => void;
  selectedId: string | null;
  onEdit: (cap: CapabilityInput) => void;
  onDelete: (id: string) => void;
  onEditAggregate?: (agg: AggregateInput) => void;
  onDeleteAggregate?: (id: string) => void;
  onAddAggregate?: (ownerId: string) => void;
  onClose: () => void;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  // One entity's body open at a time (REV-021 F1 / REV-026 F1: hierarchical disclosure, keep the
  // deep panel shallow). Collapsed by default.
  const [openEntity, setOpenEntity] = useState<string | null>(null);
  if (!selectedId) return null;
  const cap = doc.capabilities.find((c) => c.id === selectedId);
  if (!cap) return null;

  const patch = (p: Partial<CapabilityInput>): void => onEdit({ ...cap, ...p });

  const derivedFrom = ((cap.meta as { derivedFrom?: Array<{ anchor?: string }> } | undefined)?.derivedFrom ??
    []) as Array<{ anchor?: string }>;

  return (
    <aside className="node-detail">
      <div className="nd-head">
        <input className="nd-name" value={cap.name} onChange={(e) => patch({ name: e.target.value })} />
        <button className="nd-close" onClick={onClose} aria-label="close">×</button>
      </div>
      <code className="nd-id">{cap.id}</code>

      <label className="nd-field">
        <span className="nd-label">{t("capPurpose")}</span>
        <textarea value={cap.purpose ?? ""} onChange={(e) => patch({ purpose: e.target.value })} rows={2} />
      </label>

      {onReassignArea && areas.length > 0 && (
        <label className="nd-field">
          <span className="nd-label">{t("ndArea")}</span>
          <select value={capAreaId ?? ""} onChange={(e) => onReassignArea(cap.id, e.target.value)}>
            <option value="">— {t("unassignedArea")} —</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
          </select>
        </label>
      )}

      <TagList label={t("outcomes")} values={cap.outcomes ?? []} onChange={(v) => patch({ outcomes: v })} />
      <TagList label={t("ndActors")} values={cap.actors ?? []} onChange={(v) => patch({ actors: v })} />
      <TagList label={t("ndDependsOn")} values={cap.depends_on ?? []} onChange={(v) => patch({ depends_on: v })} />
      <TagList label={t("ndProduces")} values={cap.produces ?? []} onChange={(v) => patch({ produces: v })} />
      <TagList label={t("ndConsumes")} values={cap.consumes ?? []} onChange={(v) => patch({ consumes: v })} />

      {derivedFrom.length > 0 && (
        <div className="nd-row">
          <span className="nd-label">{t("ndProvenance")}</span>
          <div className="nd-chips">
            {derivedFrom.map((d, i) => (
              <span className="nd-chip prov" key={`${d.anchor ?? i}`}>#{d.anchor ?? "?"}</span>
            ))}
          </div>
        </div>
      )}

      {(() => {
        // In-context domain drill-down (SPEC-002): the entities this capability owns — editable
        // forms (the model proposes, the human decides). Hand-edits flip origin to "authored".
        const owned = aggregates.filter((a) => a.owner === cap.id);
        const editable = !!onEditAggregate;
        if (owned.length === 0 && !onAddAggregate) return null;
        return (
          <div className="nd-entities">
            <span className="nd-label">{t("entities")}</span>
            {owned.map((a) =>
              editable ? (
                <div className={`nd-entity edit ${openEntity === a.id ? "open" : ""}`} key={a.id}>
                  <div className="nd-entity-head">
                    <button
                      className="nd-entity-toggle"
                      onClick={() => setOpenEntity((cur) => (cur === a.id ? null : a.id))}
                      aria-label="toggle entity"
                    >
                      {openEntity === a.id ? "▾" : "▸"}
                    </button>
                    <input
                      className="nd-entity-name"
                      value={a.name}
                      onChange={(e) => onEditAggregate?.({ ...a, name: e.target.value })}
                    />
                    {(a.meta?.origin === "authored") && <span className="nd-authored" title={t("edited")}>✎</span>}
                    <button className="chip-x" onClick={() => onDeleteAggregate?.(a.id)} aria-label="remove entity">×</button>
                  </div>
                  {openEntity === a.id && (
                    <>
                      <code className="nd-id sm">{a.id}</code>
                      <TagList
                        label={t("references")}
                        values={a.references ?? []}
                        onChange={(v) => onEditAggregate?.({ ...a, references: v })}
                      />
                      <AttributeList
                        specs={attributeSpecs(a)}
                        onChange={(v) => onEditAggregate?.({ ...a, attributes: v })}
                      />
                      <EntityBehaviour
                        commands={commands.filter((c) => c.aggregate === a.id)}
                        events={events.filter((e) => e.aggregate === a.id)}
                        policies={policies}
                        allCommands={commands}
                      />
                    </>
                  )}
                </div>
              ) : (
                <div className="nd-entity" key={a.id}>
                  <span className="nd-entity-name">{a.name}</span>
                  {(a.references ?? []).length > 0 && (
                    <span className="nd-entity-refs">{t("references")}: {(a.references ?? []).join(", ")}</span>
                  )}
                </div>
              ),
            )}
            {onAddAggregate && (
              <button className="nd-add-entity" onClick={() => onAddAggregate(cap.id)}>{t("addEntity")}</button>
            )}
          </div>
        );
      })()}

      <button className="nd-delete" onClick={() => onDelete(cap.id)}>{t("deleteCap")}</button>
    </aside>
  );
}
