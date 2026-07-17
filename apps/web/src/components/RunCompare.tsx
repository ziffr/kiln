/**
 * Run COMPARE — diffs two test-runs of the same agent (default: latest vs previous) so the loop
 * "tune the prompt → re-run → see the effect" actually closes. Purely presentational: the traces come from
 * the bounded `observability.agentRunHistory` sidecar; the diffing is the pure `runDiff.ts`.
 *
 * The lead is a HONESTY verdict, not a number: a delta only says something about your prompt edit when the
 * prompt changed and the model stayed put. Same prompt → you're looking at model nondeterminism. Different
 * model → it isn't a prompt A/B at all. Both are stated up front, before any of the deltas.
 */

import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { compareRuns } from "../runDiff";
import type { RunTrace } from "../projects";

type T = (k: string, o?: Record<string, unknown>) => string;

function formatWhen(at: number, locale: string): string {
  try { return new Date(at).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }); } catch { return new Date(at).toLocaleString(); }
}
/** A human gap between the two captures ("4m", "2h", "3d") — the runs are minutes-to-days apart. */
function formatGap(ms: number, t: T): string {
  const s = Math.round(Math.abs(ms) / 1000);
  if (s < 60) return t("runCompareGapSec", { n: s });
  if (s < 3600) return t("runCompareGapMin", { n: Math.round(s / 60) });
  if (s < 86400) return t("runCompareGapHour", { n: Math.round(s / 3600) });
  return t("runCompareGapDay", { n: Math.round(s / 86400) });
}
/** Signed delta, "—" when nothing moved. `lower` = a fall is an improvement (fewer steps/tokens/cost). */
function DeltaCell({ label, before, after, delta, fmt }: {
  label: string; before: number; after: number; delta: number; fmt: (n: number) => string;
}): React.JSX.Element {
  const dir = delta === 0 ? "flat" : delta > 0 ? "up" : "down";
  return (
    <div className="rc-metric">
      <span className="rc-metric-label muted">{label}</span>
      <span className="rc-metric-vals">
        <span className="rc-before">{fmt(before)}</span>
        <Icon name="route" size={11} />
        <span className="rc-after"><strong>{fmt(after)}</strong></span>
      </span>
      <span className={`rc-delta rc-${dir}`}>{delta === 0 ? "—" : `${delta > 0 ? "+" : "−"}${fmt(Math.abs(delta))}`}</span>
    </div>
  );
}

/** One <option> label for a run pick: when it ran + what it cost. */
const runLabel = (r: RunTrace, i: number, total: number, locale: string, t: T): string =>
  `#${total - i} · ${formatWhen(r.at, locale)}${r.model ? ` · ${r.model}` : ""}${typeof r.estCostUsd === "number" ? ` · $${r.estCostUsd.toFixed(4)}` : ""}${i === 0 ? ` · ${t("runCompareLatest")}` : ""}`;

export function RunCompare({ history, locale, onClose, t }: {
  /** the agent's recent runs, NEWEST FIRST (bounded — see AGENT_RUN_HISTORY_MAX). */
  history: RunTrace[];
  locale: string;
  onClose: () => void;
  t: T;
}): React.JSX.Element {
  // Default: latest (index 0) vs the one before it (index 1) — the "did my last edit help?" question.
  const [afterIdx, setAfterIdx] = useState(0);
  const [beforeIdx, setBeforeIdx] = useState(1);
  const before = history[beforeIdx], after = history[afterIdx];
  const cmp = useMemo(() => (before && after ? compareRuns(before, after) : null), [before, after]);

  if (!cmp || !before || !after) return <p className="rc-empty muted">{t("runCompareNeedTwo")}</p>;

  const same = beforeIdx === afterIdx;
  const inverted = after.at < before.at; // the user picked an older run as "after" — say so, don't silently reorder

  return (
    <section className="run-compare" aria-label={t("runCompareTitle")}>
      <header className="rc-head">
        <div className="rc-title"><Icon name="route" size={13} /><h4>{t("runCompareTitle")}</h4></div>
        <button className="rc-x" onClick={onClose} aria-label={t("close")} title={t("close")}><Icon name="x" size={13} /></button>
      </header>

      <div className="rc-picks">
        <label className="rc-pick">
          <span className="muted">{t("runCompareBefore")}</span>
          <select value={beforeIdx} onChange={(e) => setBeforeIdx(Number(e.target.value))}>
            {history.map((r, i) => <option key={i} value={i}>{runLabel(r, i, history.length, locale, t)}</option>)}
          </select>
        </label>
        <label className="rc-pick">
          <span className="muted">{t("runCompareAfter")}</span>
          <select value={afterIdx} onChange={(e) => setAfterIdx(Number(e.target.value))}>
            {history.map((r, i) => <option key={i} value={i}>{runLabel(r, i, history.length, locale, t)}</option>)}
          </select>
        </label>
      </div>

      {same ? (
        <p className="rc-verdict rc-warn"><Icon name="info" size={13} />{t("runCompareSameRun")}</p>
      ) : (
        <>
          {/* The honesty lead — what this comparison can and cannot tell you, BEFORE the numbers. */}
          {cmp.verdict === "different-model" && (
            <p className="rc-verdict rc-warn">
              <Icon name="alert" size={13} />
              {t("runCompareDiffModel", { before: cmp.model.before ?? "?", after: cmp.model.after ?? "?" })}
            </p>
          )}
          {cmp.verdict === "same-prompt" && (
            <p className="rc-verdict rc-flat"><Icon name="info" size={13} />{t("runCompareSamePrompt")}</p>
          )}
          {cmp.verdict === "prompt-changed" && (
            <p className="rc-verdict rc-ai"><Icon name="sparkles" size={13} />{t("runComparePromptChanged")}</p>
          )}
          {!cmp.sameTask && <p className="rc-verdict rc-warn"><Icon name="info" size={13} />{t("runCompareDiffTask")}</p>}
          {cmp.simulated && <p className="rc-verdict rc-flat"><Icon name="info" size={13} />{t("runCompareSimulated")}</p>}
          {inverted && <p className="rc-verdict rc-flat"><Icon name="clock" size={13} />{t("runCompareInverted")}</p>}

          <div className="rc-metrics">
            <DeltaCell label={t("agentRunSteps")} {...cmp.steps} fmt={(n) => String(n)} />
            <DeltaCell label={t("tokens")} {...cmp.tokens} fmt={(n) => n.toLocaleString(locale)} />
            <DeltaCell label={t("runCompareCost")} {...cmp.costUsd} fmt={(n) => `$${n.toFixed(4)}`} />
            <div className="rc-metric">
              <span className="rc-metric-label muted">{t("runCompareGap")}</span>
              <span className="rc-metric-vals"><span className="rc-after"><strong>{formatGap(cmp.elapsedMs, t)}</strong></span></span>
            </div>
          </div>

          <section className="rc-section">
            <span className="ps-label">{t("runCompareTools")}</span>
            <div className="rc-tools">
              {cmp.tools.added.map((n) => <span key={`a${n}`} className="rc-tool rc-tool-add" title={t("runCompareToolAdded")}>+ {n}</span>)}
              {cmp.tools.removed.map((n) => <span key={`r${n}`} className="rc-tool rc-tool-del" title={t("runCompareToolRemoved")}>− {n}</span>)}
              {cmp.tools.unchanged.map((n) => <span key={`u${n}`} className="rc-tool" title={t("runCompareToolSame")}>{n}</span>)}
              {!cmp.tools.added.length && !cmp.tools.removed.length && !cmp.tools.unchanged.length && (
                <span className="muted rc-none">{t("runCompareNoTools")}</span>
              )}
            </div>
          </section>

          <section className="rc-section">
            <span className="ps-label">{t("runCompareOutput")}</span>
            {cmp.finalTextChanged ? (
              <p className="rc-diff">
                {cmp.finalText.map((s, i) => (
                  <span key={i} className={s.op === "add" ? "rc-ins" : s.op === "del" ? "rc-del" : undefined}>{s.text}</span>
                ))}
              </p>
            ) : (
              <p className="muted rc-none">{t("runCompareOutputSame")}</p>
            )}
          </section>
        </>
      )}
    </section>
  );
}
