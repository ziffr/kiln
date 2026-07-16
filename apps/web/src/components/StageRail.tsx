// The pipeline as a vertical rail — the app's spine. Each layer builds on the one above it, so the
// rail doubles as progressive disclosure: you focus one stage at a time, in dependency order.

import { Icon } from "./Icon";

export type StageId =
  | "narrative" | "capabilities" | "areas" | "entities" | "behaviour"
  | "automations" | "roles" | "workflows" | "agents" | "code";

export interface StageInfo {
  id: StageId;
  label: string;
  // Two orthogonal channels: `status` is PROVENANCE (drawn as a fill SHAPE, colorblind-safe) and
  // `health` is validation state (drawn as a COLOURED badge). Health is meaningful only once the
  // model has actually produced the layer, so it is surfaced ONLY on `ready` — a `mock` is a live
  // derivation and shows no findings at all ("mock is mock only").
  status: "empty" | "mock" | "ready"; // ○ nothing · ◐ live-derived (mock) · ● authored/generated
  findings: number;
  /** Worst non-ignored validation severity, or null when clean. Only rendered when status==="ready". */
  health?: "warn" | "error" | null;
}

export function StageRail({ stages, active, nextStep, onSelect, t }: {
  stages: StageInfo[];
  active: StageId;
  /** The recommended next step (first not-yet-built layer) — the rail doubles as a wizard progress guide. */
  nextStep?: StageId;
  onSelect: (s: StageId) => void;
  t: (k: string, o?: Record<string, unknown>) => string;
}): React.JSX.Element {
  return (
    <nav className="stage-rail" aria-label={t("stages")}>
      {stages.map((s, i) => {
        const isNext = s.id === nextStep && s.id !== active;
        return (
          <button
            key={s.id}
            className={`stage-item ${active === s.id ? "active" : ""} status-${s.status} ${isNext ? "next" : ""}`}
            onClick={() => onSelect(s.id)}
            title={isNext ? t("stageNextHint") : undefined}
          >
            <span className="stage-n">{i === stages.length - 1 ? "‹/›" : i}</span>
            <span className="stage-label">{s.label}</span>
            {isNext && <Icon name="chevronRight" size={14} className="stage-next-cue" />}
            {/* Shape = provenance; a generated layer with no open findings goes green ("done, clean"). */}
            <span className={`stage-dot dot-${s.status}${s.status === "ready" && !s.health ? " clean" : ""}`} title={t(`stage_${s.status}`)} />
            {/* Health badge — colour by worst severity, and only on generated layers (never on a mock). */}
            {s.status === "ready" && s.findings > 0 && <span className={`stage-badge sev-${s.health ?? "warn"}`} title={t("findingsCount", { count: s.findings })} aria-label={t("findingsCount", { count: s.findings })}><Icon name="alert" size={11} strokeWidth={2.25} />{s.findings}</span>}
          </button>
        );
      })}
    </nav>
  );
}
