import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AggregateInput, CapabilityDoc, CapabilityInput } from "@vbd/compiler";

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

export function NodeDetail({
  doc,
  aggregates = [],
  selectedId,
  onEdit,
  onDelete,
  onClose,
}: {
  doc: CapabilityDoc;
  aggregates?: AggregateInput[];
  selectedId: string | null;
  onEdit: (cap: CapabilityInput) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}): React.JSX.Element | null {
  const { t } = useTranslation();
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
        // In-context domain drill-down (SPEC-002 DM1): the entities this capability owns.
        const owned = aggregates.filter((a) => a.owner === cap.id);
        if (owned.length === 0) return null;
        return (
          <div className="nd-entities">
            <span className="nd-label">{t("entities")}</span>
            {owned.map((a) => (
              <div className="nd-entity" key={a.id}>
                <span className="nd-entity-name">{a.name}</span>
                {(a.references ?? []).length > 0 && (
                  <span className="nd-entity-refs">{t("references")}: {(a.references ?? []).join(", ")}</span>
                )}
              </div>
            ))}
          </div>
        );
      })()}

      <button className="nd-delete" onClick={() => onDelete(cap.id)}>{t("deleteCap")}</button>
    </aside>
  );
}
