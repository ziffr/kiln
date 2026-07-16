import { useState } from "react";
import { Icon } from "./Icon";
import type { StageId } from "./StageRail";

type T = (k: string, o?: Record<string, unknown>) => string;

/** Bold the **…** spans in a guide string (keeps the copy editable as one i18n value). */
function emph(text: string): React.ReactNode {
  return text.split("**").map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

/**
 * A plain-language "what do I do on this screen" guide for a modelling stage — the non-technical owner's
 * biggest question. Explains that the screen is a draft, what Generate/Enrich do, and to continue in the
 * rail. Dismissible per stage (remembered), so it stops being noise once understood.
 */
export function StageGuide({ stage, hasEnrich, hasGenerate, hasReview, t }: {
  stage: StageId;
  hasEnrich: boolean;
  hasGenerate: boolean;
  hasReview: boolean;
  t: T;
}): React.JSX.Element | null {
  const key = `kiln.guide.${stage}`;
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(key) === "1"; } catch { return false; }
  });
  if (dismissed) return null;
  const dismiss = (): void => {
    try { localStorage.setItem(key, "1"); } catch { /* storage blocked — non-fatal */ }
    setDismissed(true);
  };
  return (
    <div className="stage-guide">
      <Icon name="info" size={16} className="stage-guide-ic" />
      <div className="stage-guide-body">
        <p className="stage-guide-lead">{t("stageGuideDraft")}</p>
        <ul className="stage-guide-list">
          {hasGenerate && <li>{emph(t("stageGuideGen"))}</li>}
          {hasEnrich && <li>{emph(t("stageGuideEnrich"))}</li>}
          {hasReview && <li>{emph(t("stageGuideReview"))}</li>}
          <li>{emph(t("stageGuideEdit"))}</li>
          <li>{emph(t("stageGuideNext"))}</li>
        </ul>
      </div>
      <button className="stage-guide-x" onClick={dismiss} aria-label={t("guideDismiss")} title={t("guideDismiss")}>×</button>
    </div>
  );
}
