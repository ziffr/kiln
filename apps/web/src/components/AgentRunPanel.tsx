/**
 * Agent run-trace panel — an on-demand drawer (the PromptStudio pattern) that TESTS an agent against a
 * task and shows the resulting run-trace. The loop runs server-side with MOCK tool dispatch: nothing hits
 * a real system, and every tool step is badged "simulated". Shows the system prompt used, each step
 * (assistant turn / tool call + args / result), the final output, and step/token/cost totals.
 *
 * Presentational: the run + persistence live in App; the last trace is passed back in (persisted via the
 * unified `observability.agentRuns` envelope) so it survives navigation + reload.
 *
 * The recent runs (bounded — `observability.agentRunHistory`, newest first) come in alongside it, behind an
 * ON-DEMAND "History" disclosure: pick any past run to view, or open COMPARE to diff two of them. Nothing is
 * shown until asked for — the panel's default state is still just the latest run.
 */

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { RunCompare } from "./RunCompare";
import { AGENT_RUN_HISTORY_MAX } from "../runDiff";
import type { RunTrace, RunStep } from "../projects";

type T = (k: string, o?: Record<string, unknown>) => string;

function formatWhen(at: number, locale: string): string {
  try { return new Date(at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }); } catch { return new Date(at).toLocaleString(); }
}
const pretty = (v: unknown): string => { try { return typeof v === "string" ? v : JSON.stringify(v, null, 2); } catch { return String(v); } };

function StepView({ step, t }: { step: RunStep; t: T }): React.JSX.Element {
  if (step.assistantText) {
    return (
      <div className="run-step run-assistant">
        <div className="run-step-head"><Icon name="bot" size={13} /><span>{t("agentRunAssistant")}</span></div>
        <p className="run-assistant-text">{step.assistantText}</p>
      </div>
    );
  }
  if (step.toolCall) {
    return (
      <div className="run-step run-tool">
        <div className="run-step-head">
          <Icon name="code" size={13} />
          <span className="run-tool-name">{step.toolCall.name}</span>
          {step.simulated && <span className="run-sim-badge" title={t("agentRunSimulatedHint")}>{t("agentRunSimulated")}</span>}
        </div>
        <div className="run-tool-io">
          <div className="run-io-block">
            <span className="run-io-label">{t("agentRunArgs")}</span>
            <pre>{pretty(step.toolCall.input)}</pre>
          </div>
          {step.toolResult && (
            <div className="run-io-block">
              <span className="run-io-label">{t("agentRunResult")}</span>
              <pre>{pretty(step.toolResult.output)}</pre>
            </div>
          )}
        </div>
      </div>
    );
  }
  return <></>;
}

export function AgentRunPanel({
  agentName, trace, history = [], task, onTask, onRun, busy, error, engineLabel, modelLabel, locale, onClose, t,
}: {
  agentName: string;
  trace?: RunTrace;
  /** the agent's recent runs, NEWEST FIRST and bounded (AGENT_RUN_HISTORY_MAX). `history[0]` === `trace`. */
  history?: RunTrace[];
  task: string;
  onTask: (v: string) => void;
  onRun: () => void;
  busy: boolean;
  error?: string | null;
  /** The engine (provider) + model the run will use — the SAME configured for generation (set in Settings). */
  engineLabel?: string;
  modelLabel?: string;
  locale: string;
  onClose: () => void;
  t: T;
}): React.JSX.Element {
  const [showSystem, setShowSystem] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  // Which run of the history is on screen (0 = latest). A fresh run resets it — see below.
  const [viewIdx, setViewIdx] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // A fresh trace snaps back to the latest run and scrolls the steps into view.
  useEffect(() => { if (trace) { setViewIdx(0); scrollRef.current?.scrollTo({ top: 0 }); } }, [trace]);

  // The run on screen: the picked history entry, else the last trace (history is empty on a pre-history project).
  const shown: RunTrace | undefined = history[viewIdx] ?? trace;
  const tokens = shown ? (shown.usage?.input ?? 0) + (shown.usage?.output ?? 0) : 0;
  const canCompare = history.length > 1;

  return (
    <aside className="prompt-studio agent-run-panel" role="region" aria-label={t("agentRunTitle", { name: agentName })}>
      <header className="ps-head">
        <div className="ps-title">
          <Icon name="play" size={15} />
          <h3>{t("agentRun")}</h3>
          <span className="muted ps-stage">{agentName}</span>
        </div>
        <button ref={closeRef} className="ps-x" onClick={onClose} aria-label={t("close")} title={t("close")}><Icon name="x" size={15} /></button>
      </header>

      <p className="ps-lead muted">{t("agentRunLead")}</p>

      {engineLabel && (
        <p className="run-engine muted" title={t("agentRunEngineHint")}>
          <Icon name="settings" size={12} />
          {t("agentRunEngine", { engine: engineLabel, model: modelLabel ?? "" })}
        </p>
      )}

      <div className="run-input">
        <label className="run-task-label" htmlFor="agent-run-task">{t("agentRunTask")}</label>
        <textarea
          id="agent-run-task"
          className="run-task-input"
          rows={2}
          value={task}
          placeholder={t("agentRunTaskPlaceholder")}
          onChange={(e) => onTask(e.target.value)}
        />
        <button className="btn primary run-go" onClick={onRun} disabled={busy}>
          <Icon name={busy ? "refresh" : "play"} size={14} />{busy ? t("agentRunRunning") : t("agentRunGo")}
        </button>
      </div>

      {error && <p className="run-error" role="alert"><Icon name="info" size={13} />{error}</p>}

      <div className="ps-scroll run-scroll" ref={scrollRef}>
        {shown ? (
          <>
            {/* On-demand: the recent runs + the compare. Only offered once there IS a history to look at. */}
            {history.length > 1 && (
              <div className="run-history-bar">
                <button className="run-hist-toggle" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
                  <Icon name="clock" size={12} />{t("agentRunHistory", { n: history.length })}
                </button>
                {canCompare && (
                  <button
                    className={`run-hist-toggle${showCompare ? " on" : ""}`}
                    onClick={() => setShowCompare((v) => !v)}
                    aria-expanded={showCompare}
                    title={t("runCompareHint")}
                  >
                    <Icon name="route" size={12} />{t("runCompare")}
                  </button>
                )}
              </div>
            )}

            {showHistory && history.length > 1 && (
              <ul className="run-history-list">
                {history.map((r, i) => (
                  <li key={i}>
                    <button
                      className={`run-hist-item${i === viewIdx ? " on" : ""}`}
                      onClick={() => setViewIdx(i)}
                      aria-current={i === viewIdx}
                    >
                      <span className="run-hist-n">#{history.length - i}</span>
                      <span className="run-hist-when">{formatWhen(r.at, locale)}</span>
                      {r.model && <span className="ps-tag">{r.model}</span>}
                      <span className="muted run-hist-meta">
                        {r.stepCount} {t("agentRunSteps")}
                        {typeof r.estCostUsd === "number" ? ` · $${r.estCostUsd.toFixed(4)}` : ""}
                      </span>
                      {i === 0 && <span className="run-hist-latest">{t("runCompareLatest")}</span>}
                    </button>
                  </li>
                ))}
                <li className="run-hist-cap muted">{t("agentRunHistoryCap", { n: AGENT_RUN_HISTORY_MAX })}</li>
              </ul>
            )}

            {showCompare && canCompare && (
              <RunCompare history={history} locale={locale} onClose={() => setShowCompare(false)} t={t} />
            )}

            <div className="run-totals">
              {viewIdx > 0 && <span className="run-hist-viewing">{t("agentRunViewing", { n: history.length - viewIdx })}</span>}
              <span className="run-total"><strong>{shown.stepCount}</strong> {t("agentRunSteps")}</span>
              <span className="run-total"><strong>{tokens}</strong> {t("tokens")}</span>
              {typeof shown.estCostUsd === "number" && <span className="run-total"><strong>${shown.estCostUsd.toFixed(4)}</strong></span>}
              {shown.model && <span className="ps-tag">{shown.model}</span>}
              <span className="run-sim-badge" title={t("agentRunSimulatedHint")}>{t("agentRunMockMode")}</span>
              <span className="muted run-when"><Icon name="clock" size={12} />{formatWhen(shown.at, locale)}</span>
            </div>

            <section className="ps-section run-system">
              <button className="run-system-toggle" onClick={() => setShowSystem((v) => !v)} aria-expanded={showSystem}>
                <Icon name={showSystem ? "refresh" : "code"} size={12} />{t("agentRunSystem")}
              </button>
              {showSystem && <pre className="run-system-pre">{shown.system}</pre>}
            </section>

            <section className="run-steps">
              {shown.steps.map((s, i) => <StepView key={i} step={s} t={t} />)}
            </section>

            <section className="ps-section run-final">
              <span className="ps-label">{t("agentRunFinal")}</span>
              <p className="run-final-text">{shown.finalText || t("agentRunNoFinal")}</p>
            </section>
          </>
        ) : (
          <p className="ps-empty muted">{t("agentRunEmpty")}</p>
        )}
      </div>
    </aside>
  );
}
