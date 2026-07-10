import { useTranslation } from "react-i18next";
import type { CapabilityDoc, ContextInput } from "@vbd/compiler";

/**
 * Area (business-area / subdomain) detail — an editable form for one area (SPEC-003 §7). Rename,
 * edit intent, retire; shows the member capabilities + a derived term list. Reassignment of a
 * capability happens on the CAPABILITY's NodeDetail (a form select), never by dragging on the map
 * (golden invariant #1). Opens when a legend chip / area node is selected.
 */
export function AreaDetail({
  area,
  doc,
  terms,
  onEdit,
  onRetire,
  onSelectCapability,
  onClose,
}: {
  area: ContextInput;
  doc: CapabilityDoc;
  terms: string[];
  onEdit: (a: ContextInput) => void;
  onRetire: (id: string) => void;
  onSelectCapability: (id: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const patch = (p: Partial<ContextInput>): void => onEdit({ ...area, ...p });
  const nameOf = (id: string): string => doc.capabilities.find((c) => c.id === id)?.name ?? id;
  const members = area.capabilities ?? [];

  return (
    <aside className="node-detail area-detail">
      <div className="nd-head">
        <input className="nd-name" value={area.name} onChange={(e) => patch({ name: e.target.value })} />
        <button className="nd-close" onClick={onClose} aria-label="close">×</button>
      </div>
      <code className="nd-id">{t("area")} · {area.id}</code>

      <label className="nd-field">
        <span className="nd-label">{t("areaIntent")}</span>
        <textarea value={area.intent ?? ""} onChange={(e) => patch({ intent: e.target.value })} rows={2} />
      </label>

      <div className="nd-row">
        <span className="nd-label">{t("capabilities")}</span>
        <div className="nd-chips">
          {members.length === 0 && <span className="muted">—</span>}
          {members.map((m) => (
            <button className="nd-chip clickable" key={m} onClick={() => onSelectCapability(m)}>{nameOf(m)}</button>
          ))}
        </div>
      </div>

      {terms.length > 0 && (
        <div className="nd-row">
          <span className="nd-label">{t("ubiquitousTerms")}</span>
          <div className="nd-chips">
            {terms.map((tm) => <span className="nd-chip prov" key={tm}>{tm}</span>)}
          </div>
        </div>
      )}

      <button className="nd-delete" onClick={() => onRetire(area.id)}>{t("retireArea")}</button>
    </aside>
  );
}
