import type { EnrichProposal } from "../enrichReview";

type T = (k: string, o?: Record<string, unknown>) => string;

/**
 * The enrichment review — proposed additions the human accepts/declines before they merge. Grounded
 * proposals (◇) come from the model's own knowledge; web-researched ones (🔎) carry a source citation.
 */
export function EnrichPanel({ proposals, busy, onToggle, onApply, onClose, onWeb, webBusy, t }: {
  proposals: EnrichProposal[];
  busy?: boolean;
  onToggle: (id: string) => void;
  onApply: () => void;
  onClose: () => void;
  onWeb?: () => void;
  webBusy?: boolean;
  t: T;
}): React.JSX.Element {
  const accepted = proposals.filter((p) => p.accepted).length;
  const entities = proposals.filter((p) => p.kind === "entity");
  const attrs = proposals.filter((p) => p.kind === "attr");
  return (
    <div className="guide-overlay" onClick={onClose}>
      <div className="guide review-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="guide-head">
          <h2>✨ {t("enrichTitle")}</h2>
          <button className="nd-close" onClick={onClose} aria-label="close">×</button>
        </div>
        <div className="guide-body">
          <p className="hint">{t("enrichHint")}</p>
          {onWeb && (
            <button className="addcap" style={{ marginBottom: 10 }} onClick={onWeb} disabled={webBusy}>
              {webBusy ? t("enrichWebBusy") : `🔎 ${t("enrichWeb")}`}
            </button>
          )}
          {proposals.length === 0 ? (
            <p className="muted">{t("enrichNone")}</p>
          ) : (
            <>
              {entities.length > 0 && (
                <div className="enrich-group">
                  <div className="enrich-group-head">{t("enrichNewEntities")} ({entities.length})</div>
                  {entities.map((p) => <EnrichRow key={p.id} p={p} onToggle={onToggle} t={t} />)}
                </div>
              )}
              {attrs.length > 0 && (
                <div className="enrich-group">
                  <div className="enrich-group-head">{t("enrichNewAttrs")} ({attrs.length})</div>
                  {attrs.map((p) => <EnrichRow key={p.id} p={p} onToggle={onToggle} t={t} />)}
                </div>
              )}
            </>
          )}
        </div>
        <div className="enrich-foot">
          <span className="muted">{t("enrichSelected", { count: accepted, total: proposals.length })}</span>
          <button className="generate" disabled={busy || accepted === 0} onClick={onApply}>{t("enrichApply", { count: accepted })}</button>
        </div>
      </div>
    </div>
  );
}

function EnrichRow({ p, onToggle, t }: { p: EnrichProposal; onToggle: (id: string) => void; t: T }): React.JSX.Element {
  return (
    <label className={`enrich-row ${p.accepted ? "on" : "off"}`}>
      <input type="checkbox" checked={p.accepted} onChange={() => onToggle(p.id)} />
      <span className="enrich-label">{p.label}</span>
      <span className="enrich-detail muted">{p.detail}</span>
      <span className={`enrich-src src-${p.source}`} title={p.source === "web" ? t("enrichSourceWeb") : t("enrichSourceGrounded")}>{p.source === "web" ? "🔎" : "◇"}</span>
      {p.citation && <a className="enrich-cite" href={p.citation} target="_blank" rel="noreferrer">{t("enrichSource")}</a>}
    </label>
  );
}
