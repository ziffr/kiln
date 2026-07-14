import { useEffect, useState } from "react";
import type { CritiqueDiff, CritiqueFinding, LayerKind } from "@kiln/skills";
import { Icon } from "./Icon";

// The Review panel — a "closure dashboard" for the model. Each layer shows a status (○ not reviewed ·
// ⚠ N suggestions · ✓ reviewed-clean) and the Review → (pick/amend proposals) → Apply → re-review
// loop, mirroring how specs are driven to closure. Advisory throughout: the human decides which
// proposals to accept, may edit them first, and chooses whether to re-review after applying.

export interface LayerRow {
  kind: LayerKind;
  label: string;
  count: number;
}

interface Props {
  layers: LayerRow[];
  critique: Partial<Record<LayerKind, CritiqueFinding[]>>;
  diffs: Partial<Record<LayerKind, CritiqueDiff>>;
  reviewCount: Partial<Record<LayerKind, number>>;
  busy: LayerKind | null;
  refinable: (k: LayerKind) => boolean;
  effortFor: (k: LayerKind) => string;
  modelLabelFor: (k: LayerKind) => string;
  showModel: boolean;
  onReview: (k: LayerKind) => void;
  onApply: (k: LayerKind, findings: CritiqueFinding[]) => Promise<boolean>;
  onSelect: (f: CritiqueFinding) => void;
  autoRunning: boolean;
  autoLayer: LayerKind | null;
  onAuto: () => void;
  onStop: () => void;
  onSettings: () => void;
  t: (k: string, opts?: Record<string, unknown>) => string;
}

export function ReviewPanel({ layers, critique, diffs, reviewCount, busy, refinable, effortFor, modelLabelFor, showModel, onReview, onApply, onSelect, autoRunning, autoLayer, onAuto, onStop, onSettings, t }: Props): React.JSX.Element {
  const autoLabel = autoLayer ? layers.find((l) => l.kind === autoLayer)?.label ?? autoLayer : "";
  return (
    <div className="review-panel">
      <div className="review-head">
        <Icon name="sparkles" size={15} /> {t("aiReviewTitle")}
        <span className="review-auto">
          {autoRunning ? (
            <>
              <span className="review-auto-status muted">{t("aiAutoRunning")}{autoLabel ? ` · ${autoLabel}` : ""}</span>
              <button className="review-btn stop" onClick={onStop}>{t("aiStop")}</button>
            </>
          ) : (
            <>
              <button className="review-btn auto" onClick={onAuto} title={t("aiAutoHint")}><Icon name="zap" size={13} /> {t("aiAuto")}</button>
              <button className="review-btn" onClick={onSettings} title={t("settingsOpen")} aria-label={t("settingsOpen")}><Icon name="settings" size={14} /></button>
            </>
          )}
        </span>
      </div>
      <p className="review-sub muted">{t("aiReviewSub")}</p>
      <details className="review-how">
        <summary>{t("aiHowTitle")}</summary>
        <p>{t("aiHowBody")}</p>
      </details>
      {layers.map((row) => (
        <LayerReviewRow
          key={row.kind}
          row={row}
          findings={critique[row.kind]}
          diff={diffs[row.kind]}
          reviewCount={reviewCount[row.kind] ?? 0}
          isBusy={busy === row.kind}
          active={autoLayer === row.kind}
          canApply={refinable(row.kind)}
          effort={effortFor(row.kind)}
          modelLabel={showModel ? modelLabelFor(row.kind) : ""}
          autoRunning={autoRunning}
          onReview={onReview}
          onApply={onApply}
          onSelect={onSelect}
          t={t}
        />
      ))}
    </div>
  );
}

interface RowProps {
  row: LayerRow;
  findings: CritiqueFinding[] | undefined;
  diff: CritiqueDiff | undefined;
  reviewCount: number;
  isBusy: boolean;
  active: boolean;
  canApply: boolean;
  effort: string;
  modelLabel: string;
  autoRunning: boolean;
  onReview: (k: LayerKind) => void;
  onApply: (k: LayerKind, findings: CritiqueFinding[]) => Promise<boolean>;
  onSelect: (f: CritiqueFinding) => void;
  t: (k: string, opts?: Record<string, unknown>) => string;
}

function LayerReviewRow({ row, findings, diff, reviewCount, isBusy, active, canApply, effort, modelLabel, autoRunning, onReview, onApply, onSelect, t }: RowProps): React.JSX.Element {
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [applied, setApplied] = useState<number | null>(null); // shown after Apply, until re-review or dismissed
  const [applying, setApplying] = useState(false);

  // A fresh review (findings present) resets the per-finding selection/edits and clears any prior
  // "applied" banner. findings→undefined (post-apply) intentionally does NOT reset, so the banner survives.
  const sig = (findings ?? []).map((f) => f.id).join(",");
  useEffect(() => {
    if (findings && findings.length) {
      const s: Record<string, boolean> = {};
      findings.forEach((f) => (s[f.id] = true)); // default: accept all
      setSel(s);
      setEdited({});
      setEditing(null);
      setApplied(null);
    }
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  const reviewed = findings !== undefined;
  const open = Boolean(findings && findings.length > 0);
  const clean = reviewed && findings!.length === 0;
  const showApplied = applied !== null && findings === undefined;
  const selectedCount = open ? findings!.filter((f) => sel[f.id]).length : 0;

  // Round-over-round delta + a stop-here nudge. The delta summary shows after a re-review (there's a
  // prior round to compare against); the nudge fires when only subjective suggestions remain or the
  // layer has already been refined a few times — the loop rarely converges to zero, so we say so.
  const showDelta = Boolean(diff) && (open || clean);
  const onlySuggestions = open && findings!.every((f) => f.severity !== "concern");
  const showNudge = open && (onlySuggestions || reviewCount >= 3);
  const nudgeText = onlySuggestions ? t("aiOnlySuggestions") : t("aiRefinedTimes", { count: reviewCount });

  const statusText = isBusy
    ? t("aiReviewBusy")
    : clean
      ? t("aiReviewOk")
      : open
        ? t("findingsCount", { count: findings!.length })
        : showApplied
          ? t("aiAppliedShort", { count: applied })
          : t("aiReviewIdle");

  async function applySelected(): Promise<void> {
    if (!findings) return;
    const chosen = findings.filter((f) => sel[f.id]).map((f) => ({ ...f, suggestion: edited[f.id] ?? f.suggestion }));
    if (!chosen.length) return;
    setApplying(true);
    const ok = await onApply(row.kind, chosen);
    setApplying(false);
    if (ok) setApplied(chosen.length); // parent clears findings → the "applied" banner takes over
  }

  return (
    <div className={`review-row ${open ? "has-findings" : ""} ${active ? "auto-active" : ""}`}>
      <div className="review-row-head">
        <span className={`review-dot ${clean ? "clean" : open ? "warn" : showApplied ? "clean" : "idle"}`} aria-hidden>
          {clean || showApplied ? "✓" : open ? "⚠" : "○"}
        </span>
        <span className="review-label">{row.label}</span>
        {modelLabel && <span className="review-effort muted" title={t("settingsModel")}>{modelLabel}</span>}
        <span className="review-effort muted" title={t("settingsEffort")}>{effort}</span>
        <span className="review-status muted">{statusText}</span>
        <span className="review-actions">
          <button className="review-btn" onClick={() => onReview(row.kind)} disabled={isBusy || applying || autoRunning}>
            {reviewed || showApplied ? t("aiReviewAgain") : t("aiReviewGo")}
          </button>
          {open && canApply && (
            <button className="review-btn refine" onClick={() => void applySelected()} disabled={isBusy || applying || autoRunning || selectedCount === 0}>
              {applying ? t("aiApplying") : t("aiApplyN", { count: selectedCount })}
            </button>
          )}
        </span>
      </div>

      {showDelta && (
        <div className="review-delta">
          <span className="muted">{t("aiSinceReview")}</span>
          {diff!.counts.resolved > 0 && <span className="delta-chip resolved" title={t("aiDeltaResolvedHint")}>✓ {t("aiDeltaResolved", { count: diff!.counts.resolved })}</span>}
          {diff!.counts.still > 0 && <span className="delta-chip still" title={t("aiDeltaStillHint")}>↻ {t("aiDeltaStill", { count: diff!.counts.still })}</span>}
          {diff!.counts.new > 0 && <span className="delta-chip new" title={t("aiDeltaNewHint")}>✦ {t("aiDeltaNew", { count: diff!.counts.new })}</span>}
          {clean && <span className="delta-chip resolved">✓ {t("aiReviewOk")}</span>}
        </div>
      )}

      {showDelta && diff!.resolved.length > 0 && (
        <ul className="review-resolved">
          {diff!.resolved.map((r) => (
            <li key={r.id} className="muted"><span className="delta-mark resolved">✓</span> <s>{r.message}</s></li>
          ))}
        </ul>
      )}

      {open && (
        <ul className="review-findings">
          {findings!.map((f) => {
            const sugg = edited[f.id] ?? f.suggestion ?? "";
            const delta = diff?.statuses[f.id];
            return (
              <li key={f.id} className={sel[f.id] ? "" : "deselected"}>
                <div className="finding-top">
                  {canApply && (
                    <input
                      type="checkbox"
                      className="finding-check"
                      checked={Boolean(sel[f.id])}
                      onChange={(e) => setSel((s) => ({ ...s, [f.id]: e.target.checked }))}
                      title={t("aiAcceptToggle")}
                    />
                  )}
                  {delta && (
                    <span className={`finding-delta ${delta}`} title={delta === "new" ? t("aiDeltaNewHint") : t("aiDeltaStillHint")}>
                      {delta === "new" ? "✦" : "↻"}
                    </span>
                  )}
                  <span className={f.target ? "finding-msg clickable" : "finding-msg"} onClick={() => f.target && onSelect(f)}>
                    <code className={f.severity === "concern" ? "major" : "minor"}>{t(`sev_${f.severity}`)}</code> {f.message}
                  </span>
                </div>
                {(f.suggestion || editing === f.id) && (
                  <div className="finding-fix">
                    {editing === f.id ? (
                      <textarea
                        className="finding-edit"
                        value={sugg}
                        autoFocus
                        onChange={(e) => setEdited((m) => ({ ...m, [f.id]: e.target.value }))}
                        onBlur={() => setEditing(null)}
                      />
                    ) : (
                      <>
                        <span className="review-fix">→ {sugg}{edited[f.id] !== undefined && edited[f.id] !== (f.suggestion ?? "") ? ` ${t("aiEdited")}` : ""}</span>
                        {canApply && <button className="finding-amend" onClick={() => setEditing(f.id)} title={t("aiAmend")}>✎</button>}
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {showNudge && <div className="review-nudge muted">💡 {nudgeText}</div>}

      {showApplied && (
        <div className="review-applied">
          <span className="muted">✓ {t("aiApplied", { count: applied })}</span>
          <span className="review-actions">
            <button className="review-btn refine" onClick={() => onReview(row.kind)} disabled={autoRunning}>{t("aiReviewAgain")}</button>
            <button className="review-btn" onClick={() => setApplied(null)} disabled={autoRunning}>{t("aiDone")}</button>
          </span>
        </div>
      )}
    </div>
  );
}
