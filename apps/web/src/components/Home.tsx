// The project home = "Mission Control": a cockpit for the whole project, NOT a re-showing of any stage.
// The sidebar already owns identity + nav + usage + version, and each layer has its own screen — so the
// home earns its place with the things nothing else shows at once: the build-status board across all
// layers, the readiness/open-points/spend roll-up, and the quick actions. A brand-new (empty) project
// gets a calm welcome/launchpad instead. It deliberately does not repeat the Business-Narrativ summary.
import { Icon } from "./Icon";
import type { StageId, StageInfo } from "./StageRail";

type T = (k: string, o?: Record<string, unknown>) => string;

/** Compact token count: 1234 → "1.2k", 980 → "980". */
function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function Home({ stages, projectName, description, tokens, costUsd, version, onStart, onExample, onExportModel, onProjects, onSettings, onToggleSidebar, onPickStage, t }: {
  stages: StageInfo[];
  projectName: string;
  description: string;
  tokens: number;
  costUsd: number;
  version: string;
  onStart: () => void;
  onExample: () => void;
  onExportModel: () => void;
  onProjects: () => void;
  onSettings: () => void;
  onToggleSidebar: () => void;
  onPickStage: (s: StageId) => void;
  t: T;
}): React.JSX.Element {
  const modeling = stages.filter((s) => s.id !== "code");          // the nine modelled layers (excl. the code view)
  // Readiness is stricter than generation: a built-but-flagged layer isn't done. (See the plan-% fix —
  // this is what keeps the home from ever claiming "ready" while concerns are still listed.)
  const openFindings = modeling.reduce((n, s) => n + (s.status === "ready" ? s.findings : 0), 0);
  const findingLayers = modeling.filter((s) => s.status === "ready" && s.findings > 0).length;
  const done = modeling.filter((s) => s.status === "ready" && s.findings === 0).length;
  const allBuilt = modeling.every((s) => s.status === "ready");
  const pct = Math.round((done / modeling.length) * 100);
  // "Content" = they've begun. Empty project → welcome/launchpad; otherwise → mission control.
  const hasContent = modeling.some((s) => s.status !== "empty");

  // Overall state, shown as one pill: still building · built-but-flagged · clean.
  const state: { kind: "progress" | "warn" | "ok"; label: string } =
    !allBuilt ? { kind: "progress", label: t("homeStateBuilding") }
    : openFindings > 0 ? { kind: "warn", label: t("homeStateOpen", { count: openFindings }) }
    : { kind: "ok", label: t("homeStateReady") };

  // The single most important next action, in outcome terms — the primary quick action.
  const nextUnbuilt = modeling.find((s) => s.status !== "ready");
  const firstFinding = modeling.find((s) => s.status === "ready" && s.findings > 0);
  const next: { stage: StageId; label: string; icon: "sparkles" | "alert" | "play" } =
    nextUnbuilt ? { stage: nextUnbuilt.id, label: t("homeNextBuild", { label: nextUnbuilt.label }), icon: "sparkles" }
    : firstFinding ? { stage: firstFinding.id, label: t("homeTodoFix", { count: firstFinding.findings, label: firstFinding.label }), icon: "alert" }
    : { stage: "code", label: t("homeNextLaunch"), icon: "play" };

  // Per-layer node state for the status board.
  const nodeState = (s: StageInfo): "done" | "attention" | "mock" | "empty" =>
    s.status === "ready" ? (s.findings > 0 ? "attention" : "done") : s.status;

  return (
    <div className="home">
      <header className="inset-top">
        <button className="side-toggle" onClick={onToggleSidebar} aria-label={t("stages")}><Icon name="menu" size={18} /></button>
        <nav className="crumbs" aria-label={t("homeOpen")}>
          <span className="crumb-cur">{t("homeOpen")}</span>
        </nav>
      </header>
      <div className="home-body">
        {hasContent ? (
          <div className="home-inner mc">
            {/* Project header: identity + one-line stack/description + overall-state pill. */}
            <div className="mc-head">
              <span className="mc-mark"><Icon name="flame" size={19} /></span>
              <div className="mc-id">
                <h1 className="mc-name">{projectName}</h1>
                {description.trim() && <p className="mc-desc muted">{description}</p>}
              </div>
              <span className={`mc-state ${state.kind}`}>
                <span className="mc-state-dot" />{state.label}
              </span>
            </div>

            {/* Status board: every layer at a glance, clickable. Done ✓ · flagged shows its count · not-yet
                built shows its step number. This roll-up is the thing no single stage screen can show. */}
            <div className="mc-board" role="list">
              {modeling.map((s, i) => {
                const st = nodeState(s);
                return (
                  <button key={s.id} role="listitem" className={`mc-node is-${st}`} onClick={() => onPickStage(s.id)} title={s.label}>
                    <span className="mc-conn" />
                    <span className="mc-ring">
                      {st === "done" ? <Icon name="check" size={13} /> : st === "attention" ? s.findings : i}
                    </span>
                    <span className="mc-node-label">{s.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Roll-up cards: progress · open points · session spend. */}
            <div className="mc-cards">
              <div className="mc-card">
                <span className="mc-card-lab">{t("homeCardProgress")}</span>
                <b className="mc-card-val">{pct}<span className="mc-card-unit">%</span></b>
                <span className="mc-card-sub">{t("homeCardProgressSub", { done, total: modeling.length })}</span>
              </div>
              <div className="mc-card">
                <span className="mc-card-lab">{t("homeCardOpen")}</span>
                <b className={`mc-card-val${openFindings > 0 ? " warn" : ""}`}>{openFindings}</b>
                <span className="mc-card-sub">{openFindings > 0 ? t("homeCardOpenSub", { count: findingLayers }) : t("homeCardOpenNone")}</span>
              </div>
              <div className="mc-card">
                <span className="mc-card-lab">{t("homeCardSession")}</span>
                <b className="mc-card-val">${costUsd.toFixed(costUsd < 1 ? 2 : 2)}</b>
                <span className="mc-card-sub">{t("homeCardSessionSub", { tokens: fmtTokens(tokens), version })}</span>
              </div>
            </div>

            {/* Actions: the contextual next step (primary) + the project-level tools. */}
            <div className="mc-actions">
              <button className="mc-btn primary" onClick={() => onPickStage(next.stage)}>
                <Icon name={next.icon} size={15} />{next.label}
              </button>
              <button className="mc-btn" onClick={() => onPickStage("code")}><Icon name="play" size={15} />{t("homeActViewApp")}</button>
              <button className="mc-btn" onClick={onExportModel}><Icon name="download" size={15} />{t("homeActExport")}</button>
              <button className="mc-btn" onClick={onProjects}><Icon name="folder" size={15} />{t("homeActProjects")}</button>
              <button className="mc-btn" onClick={onExample}><Icon name="grid" size={15} />{t("homeExample")}</button>
              <button className="mc-btn" onClick={onSettings}><Icon name="settings" size={15} />{t("settingsOpen")}</button>
            </div>
          </div>
        ) : (
          // Launchpad / welcome — the adaptive empty state (first run, new project, public demo).
          <div className="home-inner">
            <div className="home-hero">
              <div className="home-mark"><Icon name="flame" size={28} /></div>
              <h1>{t("appTitle")}</h1>
              <p className="home-tag">{t("brandTagline")}</p>
              <p className="home-lead">{t("homeLead")}</p>
              <div className="home-cta">
                <button className="btn primary" onClick={onStart}><Icon name="sparkles" size={15} />{t("homeStart")}</button>
                <button className="btn ghost" onClick={onExample}><Icon name="grid" size={15} />{t("homeExample")}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
