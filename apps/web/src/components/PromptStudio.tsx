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

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import type { LlmOutputRecord } from "../projects";

type T = (k: string, o?: Record<string, unknown>) => string;
type Kind = "generate" | "review";

function formatWhen(at: number, locale: string): string {
  try { return new Date(at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }); } catch { return new Date(at).toLocaleString(); }
}

export function PromptStudio({
  stageLabel, genPrompt, reviewPrompt, genOverride, reviewOverride, onEdit, onReset, lastGen, lastReview, locale, onClose, t,
}: {
  stageLabel: string;
  genPrompt?: string;
  reviewPrompt?: string;
  genOverride?: string;
  reviewOverride?: string;
  onEdit: (kind: Kind, value: string) => void;
  onReset: (kind: Kind) => void;
  lastGen?: LlmOutputRecord;
  lastReview?: LlmOutputRecord;
  locale: string;
  onClose: () => void;
  t: T;
}): React.JSX.Element {
  // Which prompts exist for this stage (capabilities has a gen prompt but review-only refine, etc.).
  const kinds = useMemo<Kind[]>(() => [...(genPrompt ? ["generate" as const] : []), ...(reviewPrompt ? ["review" as const] : [])], [genPrompt, reviewPrompt]);
  const [tab, setTab] = useState<Kind>(kinds[0] ?? "generate");
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Esc closes; focus the panel on open so keyboard users land inside it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => { if (!kinds.includes(tab)) setTab(kinds[0] ?? "generate"); }, [kinds, tab]);
  useEffect(() => { setCopied(false); }, [tab]);

  const isGen = tab === "generate";
  const defaultPrompt = (isGen ? genPrompt : reviewPrompt) ?? "";
  const override = isGen ? genOverride : reviewOverride;
  const value = typeof override === "string" ? override : defaultPrompt;
  const modified = value.trim() !== defaultPrompt.trim();
  const last: LlmOutputRecord | undefined = isGen ? lastGen : lastReview;

  const copyPrompt = (): void => {
    void navigator.clipboard?.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1400); }).catch(() => {});
  };

  return (
    <aside className="prompt-studio" role="region" aria-label={t("promptStudio")}>
      <header className="ps-head">
        <div className="ps-title">
          <Icon name="code" size={15} />
          <h3>{t("promptStudio")}</h3>
          <span className="muted ps-stage">{stageLabel}</span>
        </div>
        <button ref={closeRef} className="ps-x" onClick={onClose} aria-label={t("close")} title={t("close")}><Icon name="x" size={15} /></button>
      </header>

      <p className="ps-lead muted">{t("promptStudioLead")}</p>

      {kinds.length > 1 && (
        <div className="ps-tabs" role="tablist" aria-label={t("promptStudio")}>
          {kinds.map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`ps-tab${tab === k ? " active" : ""}`} onClick={() => setTab(k)}>
              {t(k === "generate" ? "promptKindGen" : "promptKindReview")}
            </button>
          ))}
        </div>
      )}

      <div className="ps-scroll">
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
    </aside>
  );
}
