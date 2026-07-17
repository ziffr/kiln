/**
 * Prompt & Output studio — an on-demand drawer that makes the LLM calls behind a modelling stage visible
 * and lightly tunable. Three parts on one surface:
 *   1. VIEW the exact generation + review system prompts (@kiln/skills is browser-safe → imported directly).
 *   2. EDIT a prompt for THIS SESSION ONLY (never written to the stored .md); Reset restores the default.
 *   3. INSPECT the LAST captured output (generation or review) so the loop is view → tune → re-run → compare.
 *
 * The edit is session state owned by App; this component is presentational. Correctness is unaffected by an
 * override — it just swaps the request's system prompt at the provider boundary (system = override ?? default).
 */

import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon";
import { Drawer, DrawerTabs } from "./Drawer";
import type { LlmOutputRecord } from "../projects";

type T = (k: string, o?: Record<string, unknown>) => string;
// `agentReview` = the per-agent prompt critique (agent-prompt layer), shown as a third tab on the agents stage.
type Kind = "generate" | "review" | "agentReview";

function formatWhen(at: number, locale: string): string {
  try { return new Date(at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }); } catch { return new Date(at).toLocaleString(); }
}

export function PromptStudio({
  stageLabel, genPrompt, reviewPrompt, agentPrompt, genOverride, reviewOverride, agentOverride, onEdit, onReset, lastGen, lastReview, lastAgentReview, locale, onClose, t,
}: {
  stageLabel: string;
  genPrompt?: string;
  reviewPrompt?: string;
  /** the per-agent prompt-critique system prompt (agents stage only) → the third tab. */
  agentPrompt?: string;
  genOverride?: string;
  reviewOverride?: string;
  agentOverride?: string;
  onEdit: (kind: Kind, value: string) => void;
  onReset: (kind: Kind) => void;
  lastGen?: LlmOutputRecord;
  lastReview?: LlmOutputRecord;
  lastAgentReview?: LlmOutputRecord;
  locale: string;
  onClose: () => void;
  t: T;
}): React.JSX.Element {
  // Which prompts exist for this stage (capabilities has a gen prompt but review-only refine, etc.).
  const kinds = useMemo<Kind[]>(() => [...(genPrompt ? ["generate" as const] : []), ...(reviewPrompt ? ["review" as const] : []), ...(agentPrompt ? ["agentReview" as const] : [])], [genPrompt, reviewPrompt, agentPrompt]);
  const [tab, setTab] = useState<Kind>(kinds[0] ?? "generate");
  const [copied, setCopied] = useState(false);

  // Esc + open-focus are the Drawer shell's job now.
  useEffect(() => { if (!kinds.includes(tab)) setTab(kinds[0] ?? "generate"); }, [kinds, tab]);
  useEffect(() => { setCopied(false); }, [tab]);

  const isGen = tab === "generate";
  const defaultPrompt = (tab === "generate" ? genPrompt : tab === "agentReview" ? agentPrompt : reviewPrompt) ?? "";
  const override = tab === "generate" ? genOverride : tab === "agentReview" ? agentOverride : reviewOverride;
  const value = typeof override === "string" ? override : defaultPrompt;
  const modified = value.trim() !== defaultPrompt.trim();
  const last: LlmOutputRecord | undefined = tab === "generate" ? lastGen : tab === "agentReview" ? lastAgentReview : lastReview;

  const copyPrompt = (): void => {
    void navigator.clipboard?.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1400); }).catch(() => {});
  };

  return (
    <Drawer
      title={t("promptStudio")}
      icon="code"
      badge={stageLabel}
      lead={t("promptStudioLead")}
      onClose={onClose}
      closeLabel={t("close")}
      tabs={kinds.length > 1 ? (
        <DrawerTabs
          tabs={kinds.map((k) => ({ id: k, label: t(k === "generate" ? "promptKindGen" : k === "agentReview" ? "promptKindAgentReview" : "promptKindReview") }))}
          active={tab}
          onSelect={setTab}
          label={t("promptStudio")}
        />
      ) : undefined}
    >
      <div className="ps-body">
        <section className="ps-section">
          <div className="ps-section-head">
            <span className="ps-label">{t("promptSystem")}</span>
            <div className="ps-section-actions">
              {modified && <span className="ps-pill" title={t("promptSessionNote")}>{t("promptModified")}</span>}
              <button className="ps-mini" onClick={copyPrompt}><Icon name={copied ? "check" : "copy"} size={12} />{copied ? t("copied") : t("copy")}</button>
              <button className="ps-mini" disabled={!modified} onClick={() => onReset(tab)}><Icon name="refresh" size={12} />{t("promptReset")}</button>
            </div>
          </div>
          <textarea
            className="ps-textarea"
            spellCheck={false}
            value={value}
            aria-label={t("promptSystem")}
            onChange={(e) => onEdit(tab, e.target.value)}
          />
          <p className="ps-note muted"><Icon name="info" size={12} />{t("promptSessionNote")}</p>
        </section>

        <section className="ps-section">
          <div className="ps-section-head">
            <span className="ps-label">{t("promptLastOutput")}</span>
            {last && <span className="muted ps-when"><Icon name="clock" size={12} />{formatWhen(last.at, locale)}</span>}
          </div>
          {last ? (
            <>
              <div className="ps-meta">
                {last.model && <span className="ps-tag">{last.model}</span>}
                {last.effort && <span className="ps-tag">{t("effort")}: {last.effort}</span>}
                {last.provider && <span className="ps-tag muted">{last.provider}</span>}
                <span className={`ps-tag${last.overridden ? " ps-tag-on" : " muted"}`}>
                  {last.overridden ? t("promptWasTuned") : t("promptWasDefault")}
                </span>
              </div>
              <pre className="ps-output">{last.raw}</pre>
            </>
          ) : (
            <p className="ps-empty muted">{t(isGen ? "promptNoOutputGen" : "promptNoOutputReview")}</p>
          )}
        </section>
      </div>
    </Drawer>
  );
}
