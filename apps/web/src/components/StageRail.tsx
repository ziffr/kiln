// The pipeline as a vertical rail — the app's spine. Each layer builds on the one above it, so the
// rail doubles as progressive disclosure: you focus one stage at a time, in dependency order.

import { Icon } from "./Icon";

export type StageId =
  | "narrative" | "capabilities" | "areas" | "entities" | "behaviour"
  | "automations" | "roles" | "workflows" | "agents" | "code";

export interface StageInfo {
  id: StageId;
  label: string;
  status: "empty" | "mock" | "ready"; // ○ nothing · ◐ live-derived (mock) · ● authored/generated
  findings: number;
}

export function StageRail({ stages, active, onSelect, t }: {
  stages: StageInfo[];
  active: StageId;
  onSelect: (s: StageId) => void;
  t: (k: string, o?: Record<string, unknown>) => string;
}): React.JSX.Element {
  return (
    <nav className="stage-rail" aria-label={t("stages")}>
      {stages.map((s, i) => (
        <button
          key={s.id}
          className={`stage-item ${active === s.id ? "active" : ""} status-${s.status}`}
          onClick={() => onSelect(s.id)}
        >
          <span className="stage-n">{i === stages.length - 1 ? "‹/›" : i}</span>
          <span className="stage-label">{s.label}</span>
          <span className={`stage-dot dot-${s.status}`} title={t(`stage_${s.status}`)} />
          {s.findings > 0 && <span className="stage-badge" title={t("findingsCount", { count: s.findings })} aria-label={t("findingsCount", { count: s.findings })}><Icon name="alert" size={11} strokeWidth={2.25} />{s.findings}</span>}
        </button>
      ))}
    </nav>
  );
}
