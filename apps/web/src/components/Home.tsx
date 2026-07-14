// The welcome / orientation screen. First thing a newcomer sees: what Kiln is in one breath, the
// whole pipeline as a single glanceable diagram (so the left rail stops being a mystery), and two
// ways in — start from your own description, or open a worked example. The full methodology lives in
// the external documentation site; this is the 20-second version, with a link out to the docs.
import { Icon } from "./Icon";
import type { StageId } from "./StageRail";

type T = (k: string, o?: Record<string, unknown>) => string;

export function Home({ stages, onStart, onExample, docsUrl, onPickStage, t }: {
  stages: { id: StageId; label: string }[];
  onStart: () => void;
  onExample: () => void;
  docsUrl: string;
  onPickStage: (s: StageId) => void;
  t: T;
}): React.JSX.Element {
  return (
    <div className="home">
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

        <div className="home-pipe">
          <h2 className="home-pipe-h">{t("homePipeTitle")}</h2>
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

        <a className="home-guide-link" href={docsUrl} target="_blank" rel="noreferrer">
          <Icon name="book" size={15} />{t("homeGuideLink")}
        </a>
      </div>
    </div>
  );
}
