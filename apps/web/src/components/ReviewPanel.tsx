import type { CritiqueFinding, LayerKind } from "@vbd/skills";

// The Review panel — a "closure dashboard" for the model. Each layer shows a status (○ not reviewed ·
// ⚠ N suggestions · ✓ reviewed-clean) and the Review → Refine → Re-review → Clean loop, mirroring how
// specs are driven to closure. Advisory throughout: the human decides (refine, hand-edit, or dismiss).

export interface LayerRow {
  kind: LayerKind;
  label: string;
  count: number; // how many items the layer currently has (for context)
}

interface Props {
  layers: LayerRow[];
  critique: Partial<Record<LayerKind, CritiqueFinding[]>>;
  busy: LayerKind | null;
  refinable: (k: LayerKind) => boolean;
  onReview: (k: LayerKind) => void;
  onRefine: (k: LayerKind) => void;
  onSelect: (f: CritiqueFinding) => void;
  autoRunning: boolean;
  autoLayer: LayerKind | null;
  onAuto: () => void;
  onStop: () => void;
  t: (k: string, opts?: Record<string, unknown>) => string;
}

export function ReviewPanel({ layers, critique, busy, refinable, onReview, onRefine, onSelect, autoRunning, autoLayer, onAuto, onStop, t }: Props): React.JSX.Element {
  const autoLabel = autoLayer ? layers.find((l) => l.kind === autoLayer)?.label ?? autoLayer : "";
  return (
    <div className="review-panel">
      <div className="review-head">
        ✨ {t("aiReviewTitle")}
        <span className="review-auto">
          {autoRunning ? (
            <>
              <span className="review-auto-status muted">{t("aiAutoRunning")}{autoLabel ? ` · ${autoLabel}` : ""}</span>
              <button className="review-btn stop" onClick={onStop}>{t("aiStop")}</button>
            </>
          ) : (
            <button className="review-btn auto" onClick={onAuto} title={t("aiAutoHint")}>⚡ {t("aiAuto")}</button>
          )}
        </span>
      </div>
      <p className="review-sub muted">{t("aiReviewSub")}</p>
      {layers.map((row) => {
        const findings = critique[row.kind];
        const reviewed = findings !== undefined;
        const open = findings && findings.length > 0;
        const clean = reviewed && findings.length === 0;
        const isBusy = busy === row.kind;
        const active = autoLayer === row.kind;
        return (
          <div key={row.kind} className={`review-row ${open ? "has-findings" : ""} ${active ? "auto-active" : ""}`}>
            <div className="review-row-head">
              <span className={`review-dot ${clean ? "clean" : open ? "warn" : "idle"}`} aria-hidden>
                {clean ? "✓" : open ? "⚠" : "○"}
              </span>
              <span className="review-label">{row.label}</span>
              <span className="review-status muted">
                {isBusy ? t("aiReviewBusy") : clean ? t("aiReviewOk") : open ? t("findingsCount", { count: findings.length }) : t("aiReviewIdle")}
              </span>
              <span className="review-actions">
                <button className="review-btn" onClick={() => onReview(row.kind)} disabled={isBusy || autoRunning}>
                  {reviewed ? t("aiReviewAgain") : t("aiReviewGo")}
                </button>
                {open && refinable(row.kind) && (
                  <button className="review-btn refine" onClick={() => onRefine(row.kind)} disabled={isBusy || autoRunning}>
                    {t("aiRefine")}
                  </button>
                )}
              </span>
            </div>
            {open && (
              <ul className="review-findings">
                {findings.map((f) => (
                  <li
                    key={f.id}
                    className={f.target ? "clickable" : ""}
                    onClick={() => f.target && onSelect(f)}
                  >
                    <code className={f.severity === "concern" ? "major" : "minor"}>{t(`sev_${f.severity}`)}</code> {f.message}
                    {f.suggestion && <span className="review-fix"> → {f.suggestion}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
