import { useTranslation } from "react-i18next";
import type { CapabilityDoc } from "@vbd/compiler";

/**
 * Node detail panel — reads the selected capability from the active CapabilityDoc and shows
 * purpose, outcomes, relationships, and provenance (SPEC-001 §7.5 detail panel). Text-only
 * rendering (no dangerouslySetInnerHTML) per REV-005 F4.
 */
export function NodeDetail({
  doc,
  selectedId,
  onClose,
}: {
  doc: CapabilityDoc;
  selectedId: string | null;
  onClose: () => void;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  if (!selectedId) return null;

  const cap = doc.capabilities.find((c) => c.id === selectedId);
  if (!cap) return null;

  const derivedFrom = ((cap.meta as { derivedFrom?: Array<{ anchor?: string; section?: string }> } | undefined)
    ?.derivedFrom ?? []) as Array<{ anchor?: string; section?: string }>;

  const Row = ({ label, items }: { label: string; items?: string[] }) =>
    items && items.length > 0 ? (
      <div className="nd-row">
        <span className="nd-label">{label}</span>
        <div className="nd-chips">
          {items.map((i) => (
            <span className="nd-chip" key={i}>{i}</span>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <aside className="node-detail">
      <div className="nd-head">
        <h3>{cap.name}</h3>
        <button className="nd-close" onClick={onClose} aria-label="close">×</button>
      </div>
      <code className="nd-id">{cap.id}</code>
      {cap.purpose && <p className="nd-purpose">{cap.purpose}</p>}

      <Row label={t("outcomes")} items={cap.outcomes} />
      <Row label={t("ndActors")} items={cap.actors} />
      <Row label={t("ndDependsOn")} items={cap.depends_on} />
      <Row label={t("ndProduces")} items={cap.produces} />
      <Row label={t("ndConsumes")} items={cap.consumes} />

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
    </aside>
  );
}
