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
  generated: boolean; // false = still the live-mock placeholder → reviewing it is gated
}

interface Props {
  layers: LayerRow[];
  critique: Partial<Record<LayerKind, CritiqueFinding[]>>;
  staleReview: Partial<Record<LayerKind, boolean>>;
  diffs: Partial<Record<LayerKind, CritiqueDiff>>;
  reviewCount: Partial<Record<LayerKind, number>>;
  busy: LayerKind | null;
  refinable: (k: LayerKind) => boolean;
  effortFor: (k: LayerKind) => string;
  modelLabelFor: (k: LayerKind) => string;
  showModel: boolean;
  onReview: (k: LayerKind) => void;
  onApply: (k: LayerKind, findings: CritiqueFinding[]) => Promise<boolean>;
  applyResetHint: (k: LayerKind) => string | null;
  onSelect: (f: CritiqueFinding) => void;
  onIgnore: (k: LayerKind, f: CritiqueFinding) => void;
  canFix: (k: LayerKind, f: CritiqueFinding) => boolean;
  onFix: (k: LayerKind, f: CritiqueFinding) => void;
  ignoredCount: (k: LayerKind) => number;
  onRestoreIgnored: (k: LayerKind) => void;
  autoRunning: boolean;
  autoLayer: LayerKind | null;
  onReviewAll: () => void;
  onAuto: () => void;
  onStop: () => void;
  onOpenLayer: (k: LayerKind) => void; // jump to a layer's own stage to read/act on its findings
  onSettings: () => void;
  t: (k: string, opts?: Record<string, unknown>) => string;
}

export function ReviewPanel({ layers, critique, staleReview, diffs, reviewCount, busy, refinable, effortFor, modelLabelFor, showModel, onReview, onApply, applyResetHint, onSelect, onIgnore, canFix, onFix, ignoredCount, onRestoreIgnored, autoRunning, autoLayer, onReviewAll, onAuto, onStop, onOpenLayer, onSettings, t }: Props): React.JSX.Element {
  const autoLabel = autoLayer ? layers.find((l) => l.kind === autoLayer)?.label ?? autoLayer : "";
  // Progressive disclosure: the per-row technical chrome (which model / effort each layer runs at) is off
  // by default — it only matters to someone tuning engines in Settings. Off keeps the panel readable for
  // the non-technical owner, who cares about the findings, not the model tier.
  const [showDetails, setShowDetails] = useState(false);

  // Dependency-aware ordering. Layers render in arc order (each builds on the one above), so a finding
  // downstream is only meaningful once its upstream is sound — and applying an upstream layer regenerates
  // the ones below. gateIdx = the highest layer with a real problem (a "concern"); everything below it is
  // dimmed as "resolve X first". startIdx = where to begin: that gate, or the highest layer with anything
  // open if only optional suggestions remain.
  const hasConcern = (k: LayerKind): boolean => (critique[k] ?? []).some((f) => f.severity === "concern");
  const isOpen = (k: LayerKind): boolean => (critique[k]?.length ?? 0) > 0;
  // The holistic pass is a cross-layer, root-cause view, not a step in the top-down worklist — pull it out
  // and present it above, so chain-break issues are visible before per-layer polish. Gate math runs over
  // the stage layers only (holistic never becomes "start here" nor blocks anything).
  const holistic = layers.find((l) => l.kind === "holistic");
  const stageLayers = layers.filter((l) => l.kind !== "holistic");
  const gateIdx = stageLayers.findIndex((l) => hasConcern(l.kind));
  const startIdx = gateIdx >= 0 ? gateIdx : stageLayers.findIndex((l) => isOpen(l.kind));
  const gateLabel = gateIdx >= 0 ? stageLayers[gateIdx].label : "";

  // Plain-language lead: one sentence telling the owner what to do, before the per-layer detail. Computed
  // over the real (generated) layers only — placeholders aren't reviewable. Concerns dominate; otherwise
  // it nudges toward the next unreviewed layer, then reports "only suggestions" or "all clean".
  const gen = stageLayers.filter((l) => l.generated);
  const isReviewed = (k: LayerKind): boolean => critique[k] !== undefined;
  const totalN = gen.length;
  const reviewedN = gen.filter((l) => isReviewed(l.kind)).length;
  const concernN = gen.reduce((n, l) => n + (critique[l.kind]?.filter((f) => f.severity === "concern").length ?? 0), 0);
  const anySuggestions = gen.some((l) => (critique[l.kind]?.length ?? 0) > 0);
  // Per-layer closure state, for the gauge: clean (reviewed, no findings) · concern (a real problem) ·
  // suggestions-only (reviewed, optional polish) · not-yet-reviewed.
  const cleanN = gen.filter((l) => critique[l.kind]?.length === 0).length;
  const concernLayersN = gen.filter((l) => critique[l.kind]?.some((f) => f.severity === "concern")).length;
  const suggLayersN = gen.filter((l) => { const f = critique[l.kind]; return f !== undefined && f.length > 0 && !f.some((x) => x.severity === "concern"); }).length;
  const unreviewedN = totalN - reviewedN;
  const nextUnreviewed = gen.find((l) => !isReviewed(l.kind))?.label ?? "";
  const summary: { text: string; kind: "warn" | "ok" | "muted" } =
    totalN === 0 ? { text: t("aiSummaryEmpty"), kind: "muted" }
    : concernN > 0 ? { text: t("aiSummaryConcerns", { count: concernN, layer: gateLabel }), kind: "warn" }
    : reviewedN === 0 ? { text: t("aiSummaryNone", { layer: gen[0].label }), kind: "muted" }
    : reviewedN < totalN ? { text: t("aiSummaryProgress", { reviewed: reviewedN, total: totalN, layer: nextUnreviewed }), kind: "muted" }
    : anySuggestions ? { text: t("aiSummarySuggestions"), kind: "ok" }
    : { text: t("aiSummaryClean"), kind: "ok" };

  const renderRow = (row: LayerRow, opts: { startHere?: boolean; blocked?: boolean; blockedBy?: string } = {}): React.JSX.Element => (
    <LayerReviewRow
      key={row.kind}
      row={row}
      findings={critique[row.kind]}
      diff={diffs[row.kind]}
      reviewCount={reviewCount[row.kind] ?? 0}
      ignoredCount={ignoredCount(row.kind)}
      isBusy={busy === row.kind}
      active={autoLayer === row.kind}
      startHere={opts.startHere ?? false}
      blocked={opts.blocked ?? false}
      blockedBy={opts.blockedBy ?? ""}
      generated={row.generated}
      stale={Boolean(staleReview[row.kind])}
      canApply={refinable(row.kind)}
      resetHint={applyResetHint(row.kind)}
      effort={effortFor(row.kind)}
      modelLabel={showModel ? modelLabelFor(row.kind) : ""}
      showDetails={showDetails}
      autoRunning={autoRunning}
      onReview={onReview}
      onApply={onApply}
      onSelect={onSelect}
      onIgnore={onIgnore}
      canFix={canFix}
      onFix={onFix}
      onRestoreIgnored={onRestoreIgnored}
      t={t}
    />
  );

  return (
    <div className="review-panel">
      <div className="review-head">
        <Icon name="sparkles" size={15} /> {t("aiReviewTitle")}
        {!autoRunning && (
          <span className="review-auto">
            <button className="review-details-toggle muted" onClick={() => setShowDetails((v) => !v)} aria-pressed={showDetails}>
              {showDetails ? t("aiHideDetails") : t("aiShowDetails")}
            </button>
            <button className="review-btn" onClick={onSettings} title={t("settingsOpen")} aria-label={t("settingsOpen")}><Icon name="settings" size={14} /></button>
          </span>
        )}
      </div>
      <p className="review-sub muted">{t("aiReviewSub")}</p>

      {autoRunning ? (
        <div className="review-running">
          <span className="review-auto-status muted">{t("aiAutoRunning")}{autoLabel ? ` · ${autoLabel}` : ""}</span>
          <button className="review-btn stop" onClick={onStop}>{t("aiStop")}</button>
        </div>
      ) : (
        <div className="review-status">
          <div className={`review-summary ${summary.kind}`}>{summary.text}</div>
          {totalN > 0 && (
            <div className="review-gauge" role="img" aria-label={t("aiGaugeLabel", { reviewed: reviewedN, total: totalN })} title={t("aiGaugeLabel", { reviewed: reviewedN, total: totalN })}>
              {cleanN > 0 && <span className="rg-seg clean" style={{ flexGrow: cleanN }} />}
              {suggLayersN > 0 && <span className="rg-seg sugg" style={{ flexGrow: suggLayersN }} />}
              {concernLayersN > 0 && <span className="rg-seg concern" style={{ flexGrow: concernLayersN }} />}
              {unreviewedN > 0 && <span className="rg-seg todo" style={{ flexGrow: unreviewedN }} />}
            </div>
          )}
          {/* The one headline action: review every layer top-down (read-only). "Auto-fix all" — the
              review-AND-regenerate loop that MUTATES the model — is a power tool, revealed under Advanced. */}
          <div className="review-run">
            <button className="review-runall" onClick={onReviewAll} title={t("aiRunAllHint")}>
              <Icon name="sparkles" size={14} /> {t("aiRunAll")}
            </button>
            {showDetails && (
              <button className="review-runauto" onClick={onAuto} title={t("aiAutoHint")}><Icon name="zap" size={13} /> {t("aiAuto")}</button>
            )}
          </div>
        </div>
      )}

      {holistic && (
        <div className="review-crosscut">
          <div className="review-section-head"><Icon name="route" size={13} /> {t("aiCrossCutTitle")}</div>
          <p className="review-section-sub muted">{t("aiCrossCutSub")}</p>
          {renderRow(holistic)}
        </div>
      )}

      <div className="review-section-head">{t("aiLayersTitle")}</div>
      <p className="review-topdown muted">{t("aiReviewTopDown")}</p>
      <details className="review-how">
        <summary>{t("aiHowTitle")}</summary>
        <p>{t("aiHowBody")}</p>
      </details>
      {/* Stage layers are a compact roll-up: status + count only. The findings themselves are read and
          acted on in context, on each layer's own stage — click a row to jump there. */}
      {stageLayers.map((row, i) => (
        <LayerRollupRow
          key={row.kind}
          row={row}
          findings={critique[row.kind]}
          isBusy={busy === row.kind}
          active={autoLayer === row.kind}
          startHere={!autoRunning && startIdx >= 0 && i === startIdx}
          blocked={!autoRunning && gateIdx >= 0 && i > gateIdx && (critique[row.kind]?.length ?? 0) > 0}
          blockedBy={gateLabel}
          generated={row.generated}
          stale={Boolean(staleReview[row.kind])}
          showDetails={showDetails}
          effort={effortFor(row.kind)}
          modelLabel={showModel ? modelLabelFor(row.kind) : ""}
          onOpen={onOpenLayer}
          t={t}
        />
      ))}
    </div>
  );
}

interface RollupProps {
  row: LayerRow;
  findings: CritiqueFinding[] | undefined;
  isBusy: boolean;
  active: boolean;
  startHere: boolean;
  blocked: boolean;
  blockedBy: string;
  generated: boolean;
  stale: boolean;
  showDetails: boolean;
  effort: string;
  modelLabel: string;
  onOpen: (k: LayerKind) => void;
  t: (k: string, opts?: Record<string, unknown>) => string;
}

// Compact per-layer roll-up for the launcher. Shows only status + finding count; the whole row is a
// button that jumps to the layer's own stage, where the findings are read and acted on. Placeholder
// (ungenerated) and upstream-blocked layers render dimmed and non-navigating.
function LayerRollupRow({ row, findings, isBusy, active, startHere, blocked, blockedBy, generated, stale, showDetails, effort, modelLabel, onOpen, t }: RollupProps): React.JSX.Element {
  if (!generated) {
    return (
      <div className="review-row rollup gated">
        <span className="review-dot idle" aria-hidden>○</span>
        <span className="review-label">{row.label}</span>
        <span className="review-status muted">{t("aiNotGenerated")}</span>
        <span className="review-blocked-hint muted" title={t("aiNotGeneratedHint", { layer: row.label })}>{t("aiGenerateFirst")}</span>
      </div>
    );
  }

  const reviewed = findings !== undefined;
  const count = findings?.length ?? 0;
  const open = count > 0;
  const clean = reviewed && count === 0;
  const showStale = stale && !reviewed;
  const statusText = isBusy ? t("aiReviewBusy")
    : open ? t("findingsCount", { count })
    : clean ? t("aiReviewOk")
    : showStale ? t("aiChangedUpstream")
    : t("aiReviewIdle");
  const dot = clean ? "clean" : open ? "warn" : showStale ? "stale" : "idle";
  const glyph = clean ? "✓" : open ? "⚠" : showStale ? "↻" : "○";

  return (
    <button
      className={`review-row rollup ${open ? "has-findings" : ""} ${active ? "auto-active" : ""} ${startHere ? "start-here" : ""} ${showStale ? "stale" : ""} ${blocked ? "blocked" : ""}`}
      onClick={() => onOpen(row.kind)}
      title={open ? t("aiOpenLayerHint", { layer: row.label }) : t("aiOpenLayerView", { layer: row.label })}
    >
      <span className={`review-dot ${dot}`} aria-hidden>{glyph}</span>
      <span className="review-label">{row.label}</span>
      {startHere && <span className="review-start" title={t("aiStartHereHint")}><Icon name="chevronDown" size={12} /> {t("aiStartHere")}</span>}
      {showDetails && modelLabel && <span className="review-effort muted">{modelLabel}</span>}
      {showDetails && <span className="review-effort muted">{effort}</span>}
      {blocked && <span className="review-blocked-hint muted">{t("aiBlockedBy", { layer: blockedBy })}</span>}
      <span className="review-status muted">{statusText}</span>
      <Icon name="chevronRight" size={14} className="review-rollup-caret" />
    </button>
  );
}

interface RowProps {
  row: LayerRow;
  findings: CritiqueFinding[] | undefined;
  diff: CritiqueDiff | undefined;
  reviewCount: number;
  ignoredCount: number;
  isBusy: boolean;
  active: boolean;
  startHere: boolean;
  blocked: boolean;
  blockedBy: string;
  generated: boolean;
  stale: boolean;
  canApply: boolean;
  resetHint: string | null;
  effort: string;
  modelLabel: string;
  showDetails: boolean;
  autoRunning: boolean;
  onReview: (k: LayerKind) => void;
  onApply: (k: LayerKind, findings: CritiqueFinding[]) => Promise<boolean>;
  onSelect: (f: CritiqueFinding) => void;
  onIgnore: (k: LayerKind, f: CritiqueFinding) => void;
  canFix: (k: LayerKind, f: CritiqueFinding) => boolean;
  onFix: (k: LayerKind, f: CritiqueFinding) => void;
  onRestoreIgnored: (k: LayerKind) => void;
  t: (k: string, opts?: Record<string, unknown>) => string;
}

function LayerReviewRow({ row, findings, diff, reviewCount, ignoredCount, isBusy, active, startHere, blocked, blockedBy, generated, stale, canApply, resetHint, effort, modelLabel, showDetails, autoRunning, onReview, onApply, onSelect, onIgnore, canFix, onFix, onRestoreIgnored, t }: RowProps): React.JSX.Element {
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [applied, setApplied] = useState<number | null>(null); // shown after Apply, until re-review or dismissed
  const [applying, setApplying] = useState(false);
  const [override, setOverride] = useState(false); // "Review anyway" — expand a blocked (downstream) layer

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
  // Cleared by an upstream Apply, previously reviewed → "changed upstream", not "not reviewed".
  const showStale = stale && !reviewed && !showApplied;
  const selectedCount = open ? findings!.filter((f) => sel[f.id]).length : 0;
  // Concerns (real problems) before suggestions (optional polish) — stable within each group.
  const ordered = open ? [...findings!].sort((a, b) => (a.severity === "concern" ? 0 : 1) - (b.severity === "concern" ? 0 : 1)) : [];

  // Round-over-round delta + stop-here signals. The delta summary shows after a re-review. When findings
  // recur (seen in an earlier round, gone, now back) the layer is oscillating — a generative Apply keeps
  // re-introducing what it fixed before — so we raise an explicit warning instead of the softer nudge.
  const showDelta = Boolean(diff) && (open || clean);
  const recurring = diff?.counts.recurring ?? 0;
  const oscillating = open && recurring > 0;
  const onlySuggestions = open && findings!.every((f) => f.severity !== "concern");
  const showNudge = open && !oscillating && (onlySuggestions || reviewCount >= 3);
  const nudgeText = onlySuggestions ? t("aiOnlySuggestions") : t("aiRefinedTimes", { count: reviewCount });

  const statusText = isBusy
    ? t("aiReviewBusy")
    : clean
      ? t("aiReviewOk")
      : open
        ? t("findingsCount", { count: findings!.length })
        : showApplied
          ? t("aiAppliedShort", { count: applied })
          : showStale
            ? t("aiChangedUpstream")
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

  // Provenance gate: this layer is still the live-mock placeholder (never generated). Reviewing it would
  // spend real LLM budget critiquing deterministic filler, so collapse it to one dimmed line and offer no
  // Review action — the user generates the layer on its own stage first. Takes precedence over the
  // blocked/idle states (a clearer reason than "resolve X first").
  if (!generated) {
    return (
      <div className="review-row gated">
        <div className="review-row-head">
          <span className="review-dot idle" aria-hidden>○</span>
          <span className="review-label">{row.label}</span>
          <span className="review-status muted">{t("aiNotGenerated")}</span>
          <span className="review-actions">
            <span className="review-blocked-hint muted" title={t("aiNotGeneratedHint", { layer: row.label })}>{t("aiGenerateFirst")}</span>
          </span>
        </div>
      </div>
    );
  }

  // A downstream layer whose upstream still has an open concern: collapse it to one dimmed line so the
  // list shrinks to what's actionable now. "Review anyway" expands it for anyone who wants to look ahead.
  if (blocked && !override && !active) {
    return (
      <div className="review-row blocked">
        <div className="review-row-head">
          <span className="review-dot blocked" aria-hidden><Icon name="lock" size={13} /></span>
          <span className="review-label">{row.label}</span>
          <span className="review-status muted">{open ? t("findingsCount", { count: findings!.length }) : showStale ? t("aiChangedUpstream") : t("aiReviewIdle")}</span>
          <span className="review-actions">
            <span className="review-blocked-hint muted" title={t("aiBlockedHint", { layer: blockedBy })}>{t("aiBlockedBy", { layer: blockedBy })}</span>
            <button className="review-btn" onClick={() => setOverride(true)}>{t("aiReviewAnyway")}</button>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`review-row ${open ? "has-findings" : ""} ${active ? "auto-active" : ""} ${startHere ? "start-here" : ""} ${showStale ? "stale" : ""}`}>
      <div className="review-row-head">
        <span className={`review-dot ${clean ? "clean" : open ? "warn" : showApplied ? "clean" : showStale ? "stale" : "idle"}`} aria-hidden>
          {clean || showApplied ? "✓" : open ? "⚠" : showStale ? "↻" : "○"}
        </span>
        <span className="review-label">{row.label}</span>
        {startHere && <span className="review-start" title={t("aiStartHereHint")}><Icon name="chevronDown" size={12} /> {t("aiStartHere")}</span>}
        {showDetails && modelLabel && <span className="review-effort muted" title={t("settingsModel")}>{modelLabel}</span>}
        {showDetails && <span className="review-effort muted" title={t("settingsEffort")}>{effort}</span>}
        <span className="review-status muted">{statusText}</span>
        {/* Per-layer manual controls (Review this one layer / batch-Apply) are power tools — hidden by
            default. The whole-model "Review all layers" button drives the common flow; single-layer review
            also lives on the layer's own stage screen. Revealed under Advanced. */}
        {showDetails && (
          <span className="review-actions">
            <button className="review-btn" onClick={() => onReview(row.kind)} disabled={isBusy || applying || autoRunning}>
              {reviewed || showApplied || showStale ? t("aiReviewAgain") : t("aiReviewGo")}
            </button>
            {open && canApply && (
              <button className="review-btn refine" onClick={() => void applySelected()} disabled={isBusy || applying || autoRunning || selectedCount === 0}>
                {applying ? t("aiApplying") : t("aiApplyN", { count: selectedCount })}
              </button>
            )}
          </span>
        )}
      </div>

      {blocked && (
        <div className="review-blocked-note muted"><Icon name="lock" size={11} /> {t("aiBlockedHint", { layer: blockedBy })}</div>
      )}

      {open && canApply && resetHint && (
        <div className="review-cascade-note muted"><Icon name="alert" size={11} /> {resetHint}</div>
      )}

      {showDelta && (
        <div className="review-delta">
          <span className="muted">{t("aiSinceReview")}</span>
          {diff!.counts.resolved > 0 && <span className="delta-chip resolved" title={t("aiDeltaResolvedHint")}>✓ {t("aiDeltaResolved", { count: diff!.counts.resolved })}</span>}
          {diff!.counts.still > 0 && <span className="delta-chip still" title={t("aiDeltaStillHint")}>↻ {t("aiDeltaStill", { count: diff!.counts.still })}</span>}
          {recurring > 0 && <span className="delta-chip recurring" title={t("aiDeltaRecurringHint")}>↺ {t("aiDeltaRecurring", { count: recurring })}</span>}
          {diff!.counts.new > 0 && <span className="delta-chip new" title={t("aiDeltaNewHint")}>✦ {t("aiDeltaNew", { count: diff!.counts.new })}</span>}
          {clean && <span className="delta-chip resolved">✓ {t("aiReviewOk")}</span>}
        </div>
      )}

      {oscillating && (
        <div className="review-oscillation">⚠ {t("aiOscillating")}</div>
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
          {ordered.map((f) => {
            const sugg = edited[f.id] ?? f.suggestion ?? "";
            const delta = diff?.statuses[f.id];
            return (
              <li key={f.id} className={sel[f.id] ? "" : "deselected"}>
                <div className="finding-top">
                  {showDetails && canApply && (
                    <input
                      type="checkbox"
                      className="finding-check"
                      checked={Boolean(sel[f.id])}
                      onChange={(e) => setSel((s) => ({ ...s, [f.id]: e.target.checked }))}
                      title={t("aiAcceptToggle")}
                    />
                  )}
                  {delta && (
                    <span className={`finding-delta ${delta}`} title={delta === "new" ? t("aiDeltaNewHint") : delta === "recurring" ? t("aiDeltaRecurringHint") : t("aiDeltaStillHint")}>
                      {delta === "new" ? "✦" : delta === "recurring" ? "↺" : "↻"}
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
                        {showDetails && canApply && <button className="finding-amend" onClick={() => setEditing(f.id)} title={t("aiAmend")}>✎</button>}
                      </>
                    )}
                  </div>
                )}
                <div className="finding-acts">
                  {canFix(row.kind, f) ? (
                    <button className="finding-act fix" onClick={() => onFix(row.kind, f)} title={t("aiSurgicalFixHint")}><Icon name="zap" size={12} /> {t("aiSurgicalFix")}</button>
                  ) : (
                    f.target && <button className="finding-act" onClick={() => onSelect(f)} title={t("aiGoFixHint")}><Icon name="pencil" size={12} /> {t("aiGoFix")}</button>
                  )}
                  <button className="finding-act ignore" onClick={() => onIgnore(row.kind, f)} title={t("aiIgnoreHint")}><Icon name="x" size={12} /> {t("aiIgnore")}</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showNudge && <div className="review-nudge muted">💡 {nudgeText}</div>}

      {ignoredCount > 0 && (
        <button className="review-restore muted" onClick={() => onRestoreIgnored(row.kind)}>
          <Icon name="refresh" size={12} /> {t("aiRestoreIgnored", { count: ignoredCount })}
        </button>
      )}

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
