/**
 * Agent run-trace panel — an on-demand drawer (the PromptStudio pattern) that TESTS an agent against a
 * task and shows the resulting run-trace. The loop runs server-side with MOCK tool dispatch: nothing hits
 * a real system, and every tool step is badged "simulated". Shows the system prompt used, each step
 * (assistant turn / tool call + args / result), the final output, and step/token/cost totals.
 *
 * Presentational: the run + persistence live in App; the last trace is passed back in (persisted via the
 * unified `observability.agentRuns` envelope) so it survives navigation + reload.
 */

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
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
  agentName, trace, task, onTask, onRun, busy, error, locale, onClose, t,
}: {
  agentName: string;
  trace?: RunTrace;
  task: string;
  onTask: (v: string) => void;
  onRun: () => void;
  busy: boolean;
  error?: string | null;
  locale: string;
  onClose: () => void;
  t: T;
}): React.JSX.Element {
  const [showSystem, setShowSystem] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // A fresh trace scrolls the steps into view.
  useEffect(() => { if (trace) scrollRef.current?.scrollTo({ top: 0 }); }, [trace]);

  const tokens = trace ? (trace.usage?.input ?? 0) + (trace.usage?.output ?? 0) : 0;

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
        {trace ? (
          <>
            <div className="run-totals">
              <span className="run-total"><strong>{trace.stepCount}</strong> {t("agentRunSteps")}</span>
              <span className="run-total"><strong>{tokens}</strong> {t("tokens")}</span>
              {typeof trace.estCostUsd === "number" && <span className="run-total"><strong>${trace.estCostUsd.toFixed(4)}</strong></span>}
              {trace.model && <span className="ps-tag">{trace.model}</span>}
              <span className="run-sim-badge" title={t("agentRunSimulatedHint")}>{t("agentRunMockMode")}</span>
              <span className="muted run-when"><Icon name="clock" size={12} />{formatWhen(trace.at, locale)}</span>
            </div>

            <section className="ps-section run-system">
              <button className="run-system-toggle" onClick={() => setShowSystem((v) => !v)} aria-expanded={showSystem}>
                <Icon name={showSystem ? "refresh" : "code"} size={12} />{t("agentRunSystem")}
              </button>
              {showSystem && <pre className="run-system-pre">{trace.system}</pre>}
            </section>

            <section className="run-steps">
              {trace.steps.map((s, i) => <StepView key={i} step={s} t={t} />)}
            </section>

            <section className="ps-section run-final">
              <span className="ps-label">{t("agentRunFinal")}</span>
              <p className="run-final-text">{trace.finalText || t("agentRunNoFinal")}</p>
            </section>
          </>
        ) : (
          <p className="ps-empty muted">{t("agentRunEmpty")}</p>
        )}
      </div>
    </aside>
  );
}
