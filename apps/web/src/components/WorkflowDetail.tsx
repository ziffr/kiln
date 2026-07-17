// The detail slide-in for a selected workflow (SPEC-009): its routing mode + rationale, and its ordered
// steps — each step resolved to the command it runs, the entity that command acts on, the events it emits,
// and any per-step delegation. Clicking a step jumps to that command in the Behaviour view.
import { Icon, type IconName } from "./Icon";
import { ServiceAuthNote, type ServiceOption } from "./ServiceAuth";
import type { WorkflowInput, DomainDoc } from "@kiln/compiler";

type T = (k: string, o?: Record<string, unknown>) => string;
type ProcessMode = "workflow" | "agent" | "external";
const MODE_ICON: Record<ProcessMode, IconName> = { workflow: "route", agent: "bot", external: "globe" };
const MODE_KEY: Record<ProcessMode, string> = { workflow: "modeWorkflow", agent: "modeAgent", external: "modeExternal" };

export function WorkflowDetail({ workflow, domain, rationale, services, t, onSelectStep, onClose }: {
  workflow: WorkflowInput;
  domain: DomainDoc;
  rationale?: string;
  services?: ServiceOption[];
  t: T;
  onSelectStep: (commandId: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const w = workflow;
  const mode = (w.mode ?? "workflow") as ProcessMode;
  const cmd = (id: string) => (domain.commands ?? []).find((c) => c.id === id);
  const evName = (id: string) => (domain.events ?? []).find((e) => e.id === id)?.name ?? id;
  const svc = (id?: string) => services?.find((s) => s.id === id);
  const svcName = (id?: string) => svc(id)?.name ?? id;
  const steps = w.steps ?? [];
  return (
    <div className="nd wf-detail">
      <div className="nd-head">
        <strong>{w.name || w.id}</strong>
        <button className="nd-close" onClick={onClose} aria-label="close">×</button>
      </div>
      <div className="wf-detail-meta">
        <span className={`wf-mode-chip wf-mode-${mode}`}><Icon name={MODE_ICON[mode]} size={12} />{t(MODE_KEY[mode])}</span>
        <span className="muted">· {t("stepsCount", { count: steps.length })}</span>
      </div>
      {rationale && <p className="wf-detail-rationale muted">{rationale}</p>}
      {mode === "external" && w.service && (
        <>
          <p className="wf-detail-ext muted"><Icon name="globe" size={12} /> {t("externalDelegate")}: {svcName(w.service)}</p>
          <ServiceAuthNote service={svc(w.service)} t={t} />
        </>
      )}

      <h4 className="wf-detail-h">{t("steps")}</h4>
      <ol className="wf-detail-steps">
        {steps.map((s) => {
          const c = cmd(s);
          const boundTo = w.stepBindings?.[s];
          const emits = (c?.emits ?? []).map(evName);
          return (
            <li key={s}>
              <button className="wf-detail-step" onClick={() => onSelectStep(s)} title={t("stepDetailHint")}>
                <span className="wf-detail-cmd">{c?.name ?? s}</span>
                {c?.aggregate && <span className="muted"> · {c.aggregate}</span>}
              </button>
              {emits.length > 0 && <div className="wf-detail-emits muted">→ {emits.join(", ")}</div>}
              {boundTo && <div className="wf-detail-bound"><Icon name="globe" size={11} /> {svcName(boundTo)}</div>}
              {!c && <div className="wf-detail-emits muted">{t("stepUnknownCmd")}</div>}
            </li>
          );
        })}
        {steps.length === 0 && <li className="muted">{t("noSteps")}</li>}
      </ol>
    </div>
  );
}
