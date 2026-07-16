// The project home. For a non-technical owner it must answer, in five seconds and in their language:
// what does this understand about my business, how far along am I, and what's the one thing to do next.
// So it opens like an advisor (mirrors the business back), shows a three-phase journey (Describe · Shape ·
// Launch) instead of nine technical layers, and offers a single clear next action. The full nine-layer
// pipeline is demoted to a collapsible "how it works". A brand-new (empty) project sees a welcome instead.
import { Icon } from "./Icon";
import type { StageId, StageInfo } from "./StageRail";

type T = (k: string, o?: Record<string, unknown>) => string;

/** Compact token count: 1234 → "1.2k", 980 → "980". */
function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function Home({ stages, projectName, summary, summaryLoading, counts, tokens, costUsd, onStart, onExample, docsUrl, onToggleSidebar, onPickStage, t }: {
  stages: StageInfo[];
  projectName: string;
  summary: string;
  summaryLoading: boolean;
  counts: { capabilities: number; entities: number; roles: number; workflows: number };
  tokens: number;
  costUsd: number;
  onStart: () => void;
  onExample: () => void;
  docsUrl: string;
  onToggleSidebar: () => void;
  onPickStage: (s: StageId) => void;
  t: T;
}): React.JSX.Element {
  const modeling = stages.filter((s) => s.id !== "code");          // the nine modelled layers (excl. the code view)
  const ready = modeling.filter((s) => s.status === "ready").length;
  const pct = Math.round((ready / modeling.length) * 100);
  // "Content" = they've begun. Empty project → welcome; otherwise → the advisor/journey dashboard.
  const hasContent = modeling.some((s) => s.status !== "empty");

  // Three human phases over the nine layers: Describe (narrative) · Shape (capabilities…agents) · Launch (export).
  const narrativeReady = stages.find((s) => s.id === "narrative")?.status === "ready";
  const shapeLayers = modeling.filter((s) => s.id !== "narrative");
  const shapeReady = shapeLayers.filter((s) => s.status === "ready").length;
  const allShaped = shapeReady === shapeLayers.length;
  const phases: { key: string; label: string; state: "done" | "now" | "upcoming" }[] = [
    { key: "describe", label: t("homePhaseDescribe"), state: narrativeReady ? "done" : "now" },
    { key: "shape", label: t("homePhaseShape"), state: !narrativeReady ? "upcoming" : allShaped ? "done" : "now" },
    { key: "launch", label: t("homePhaseLaunch"), state: allShaped ? "now" : "upcoming" },
  ];

  // The single most important next action, in outcome terms.
  const nextUnbuilt = modeling.find((s) => s.status !== "ready");
  // Findings are meaningful only on a generated layer ("mock is mock only" — see StageRail): never
  // surface a fix-todo for a still-mock/empty layer, matching the status-gated rail badge.
  const firstFinding = stages.find((s) => s.status === "ready" && s.findings > 0);
  const nextAction: { stage: StageId; title: string; icon: "sparkles" | "alert" | "check" } =
    nextUnbuilt ? { stage: nextUnbuilt.id, title: t("homeNextBuild", { label: nextUnbuilt.label }), icon: "sparkles" }
    : firstFinding ? { stage: firstFinding.id, title: t("homeTodoFix", { count: firstFinding.findings, label: firstFinding.label }), icon: "alert" }
    : { stage: "code", title: t("homeNextLaunch"), icon: "check" };
  // Secondary follow-ups: other layers with findings (the primary already covers the first).
  const more = stages.filter((s) => s.status === "ready" && s.findings > 0 && s.id !== nextAction.stage);

  return (
    <div className="home">
      <div className="home-top">
        <button className="side-toggle" onClick={onToggleSidebar} aria-label={t("stages")}><Icon name="menu" size={18} /></button>
      </div>
      <div className="home-inner">
        {hasContent ? (
          <div className="home-advise">
            <div className="home-brandline">
              <span className="home-mark sm"><Icon name="flame" size={17} /></span>
              <span>{t("appTitle")} <span className="muted">· {t("brandTagline")}</span></span>
            </div>

            <div className="home-say-block">
              <p className="home-eyebrow">{t("homeUnderstood", { name: projectName })}</p>
              {summary.trim()
                ? <p className="home-say">{summary}</p>
                : <p className="home-say muted">{t("homeNoSummary")}</p>}
              {summaryLoading && <p className="home-say-busy"><Icon name="sparkles" size={13} /> {t("homeSummarising")}</p>}
            </div>

            <div className="home-counts">
              {([
                ["capabilities", counts.capabilities],
                ["entities", counts.entities],
                ["roles", counts.roles],
                ["workflows", counts.workflows],
              ] as const).map(([key, n]) => (
                <div className="home-count" key={key}>
                  <b>{n}</b>
                  <span>{t(`homeCount_${key}`)}</span>
                </div>
              ))}
            </div>

            <div className="home-journey-block">
              <ol className="home-journey">
                {phases.map((p, i) => (
                  <li key={p.key} className={`home-phase ${p.state}`}>
                    {i > 0 && <span className="home-phase-bar" />}
                    <span className="home-phase-ring">{p.state === "done" ? <Icon name="check" size={14} /> : i + 1}</span>
                    <span className="home-phase-label">{p.label}</span>
                  </li>
                ))}
              </ol>
              <p className="home-plan-pct">{t("homePlanPct", { pct })}</p>
            </div>

            <button className="home-next" onClick={() => onPickStage(nextAction.stage)}>
              <span className={`home-next-ic ic-${nextAction.icon}`}><Icon name={nextAction.icon} size={17} /></span>
              <span className="home-next-body">
                <span className="home-next-lab">{t("homeNextLabel")}</span>
                <span className="home-next-title">{nextAction.title}</span>
                <span className="home-next-sub">{t("homeNextSub")}</span>
              </span>
              <Icon name="chevronRight" size={18} className="home-next-go" />
            </button>

            {more.length > 0 && (
              <ul className="home-more">
                {more.map((s) => (
                  <li key={s.id}>
                    <button className="home-more-item" onClick={() => onPickStage(s.id)}>
                      <Icon name="alert" size={14} className="home-more-ic" />
                      <span>{t("homeTodoFix", { count: s.findings, label: s.label })}</span>
                      <Icon name="chevronRight" size={13} className="home-more-go" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <p className="home-usage muted">
              {tokens > 0 ? t("homeUsageLine", { tokens: fmtTokens(tokens), cost: `$${costUsd.toFixed(costUsd < 1 ? 4 : 2)}` }) : t("homeKpiUsageEmpty")}
            </p>
          </div>
        ) : (
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
        )}

        {/* The nine-layer pipeline, demoted from the greeting to an on-demand "how it works". */}
        <details className="home-how">
          <summary>
            <Icon name="route" size={15} />
            <span>{t("homeHowTitle")}</span>
            <Icon name="chevronDown" size={15} className="home-how-caret" />
          </summary>
          <div className="home-how-body">
            <p className="home-pipe-sub muted">{t("homePipeSub")}</p>
            <ol className="home-flow">
              {stages.map((s, i) => (
                <li key={s.id} className="home-flow-item">
                  {i > 0 && <Icon name="chevronRight" size={14} className="home-flow-arrow" />}
                  <button className="home-flow-chip" onClick={() => onPickStage(s.id)}>
                    <span className="home-flow-n">{i === stages.length - 1 ? "‹/›" : i}</span>
                    <span className="home-flow-label">{s.label}</span>
                  </button>
                </li>
              ))}
            </ol>
            <p className="home-flow-legend muted">{t("homePipeLegend")}</p>
          </div>
        </details>

        <a className="home-guide-link" href={docsUrl} target="_blank" rel="noreferrer">
          <Icon name="book" size={15} />{t("homeGuideLink")}
        </a>
      </div>
    </div>
  );
}
