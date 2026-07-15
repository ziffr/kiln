import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CoachConfig } from "@kiln/skills";
import type { CoachMsg as Msg } from "../projects";
import { NARRATIVE_TEMPLATE } from "../projects";
import { SERVICE_URL } from "../config";
import { Icon } from "./Icon";

/**
 * The Narrative screen as a business-owner DIALOGUE rather than a set of tabs. Three phases:
 *  - compose:  one input (type / paste / upload a transcript) → "Understand".
 *  - review:   Kiln mirrors the business back (summary), shows how well it understands (derived from the
 *              real open-question count), and lists the open questions — the advisor beat.
 *  - interview: "Continue the conversation" seeds the existing NarrativeCoach with their own words +
 *              an opening that picks up the first open question, then runs the normal Q&A cycle.
 * A quiet "Direkt bearbeiten" reveals the raw structured narrative for power users. All roads produce the
 * one artifact — the structured narrative (source of truth).
 */
export function NarrativeInput({
  narrative,
  onNarrative,
  summary,
  openQuestions,
  onUnderstood,
  onSpend,
  model,
  effort,
  provider,
  config,
  onConfig,
  transcript,
  onTranscript,
  lang,
}: {
  narrative: string;
  onNarrative: (v: string) => void;
  summary: string;
  openQuestions: string[];
  onUnderstood: (r: { summary: string; openQuestions: string[]; narrative?: string }) => void;
  onSpend: (d: { estCostUsd: number; sessionSpendUsd: number; usage: { input: number; output: number } }) => void;
  model: string;
  effort: string;
  provider?: string;
  config: CoachConfig;
  onConfig: (c: CoachConfig) => void;
  transcript: Msg[];
  onTranscript: (t: Msg[]) => void;
  lang: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const hasNarrative = narrative.trim().length > 0 && narrative.trim() !== NARRATIVE_TEMPLATE.trim();

  // Phase: resume an in-progress interview, else review a described business, else compose from scratch.
  const [phase, setPhase] = useState<"compose" | "review" | "interview">(
    transcript.length ? "interview" : hasNarrative ? "review" : "compose",
  );
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Interview (NarrativeCoach) state.
  const greeting: Msg = { role: "assistant", content: t("coachGreeting") };
  const [messages, setMessages] = useState<Msg[]>(transcript.length ? [greeting, ...transcript] : [greeting]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = chatRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages, busy, pending, phase]);

  /** Run one "understand" pass. `text` is the raw input (compose) or the existing narrative (review). */
  async function understand(text: string, updateNarrative: boolean): Promise<void> {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${SERVICE_URL}/api/understand`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ raw: text, model, effort, provider }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onSpend(data);
      onUnderstood({
        summary: typeof data.summary === "string" ? data.summary : "",
        openQuestions: Array.isArray(data.openQuestions) ? data.openQuestions.filter((x: unknown) => typeof x === "string") : [],
        narrative: updateNarrative && typeof data.narrative === "string" && data.narrative.trim() ? data.narrative : undefined,
      });
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Enter the interview, seeding it with the owner's own words + an opening that picks up a gap. */
  function toInterview(): void {
    const opener = openQuestions.length
      ? t("interviewOpener", { question: openQuestions[0] })
      : t("interviewOpenerNoGaps");
    // Their described business becomes the first user turn; the coach opens on the first gap.
    const seed: Msg[] = transcript.length
      ? transcript
      : [{ role: "user", content: raw.trim() || narrative }, { role: "assistant", content: opener }];
    setMessages([greeting, ...seed]);
    onTranscript(seed);
    setReady(false);
    setPending(null);
    setPhase("interview");
  }

  async function turn(userText: string): Promise<void> {
    const withUser = [...messages, { role: "user" as const, content: userText }];
    setMessages(withUser);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${SERVICE_URL}/api/coach`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: withUser, model, effort, config: { ...config, language: lang } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const withReply: Msg[] = [...withUser, { role: "assistant", content: data.reply || "…" }];
      setMessages(withReply);
      onTranscript(withReply.slice(1));
      setReady(Boolean(data.readyToGenerate));
      if (typeof data.narrative === "string" && data.narrative.trim()) setPending(data.narrative);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const applyPending = (): void => { if (pending) { onNarrative(pending); setPending(null); } };
  const errLine = error && <p className="err-line"><code>{error}</code> — {t("serviceHint")}</p>;

  // ── Compose: one input ─────────────────────────────────────────────────────────────────────────
  if (phase === "compose") {
    return (
      <div className="narrative-input dialogue">
        <div className="nd-compose">
          <p className="nd-compose-lead">{t("composeLead")}</p>
          <textarea
            className="nd-compose-box"
            value={raw}
            placeholder={t("composePlaceholder")}
            onChange={(e) => setRaw(e.target.value)}
            spellCheck={false}
            autoFocus
          />
          {errLine}
          <div className="nd-compose-actions">
            <button className="nd-upload" disabled={busy} onClick={() => fileRef.current?.click()} title={t("composeUploadHint")}>
              <Icon name="upload" size={15} /> {t("composeUpload")}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.markdown,.text,text/plain,text/markdown"
              style={{ display: "none" }}
              onChange={async (e) => { const f = e.target.files?.[0]; if (f) setRaw(await f.text()); e.target.value = ""; }}
            />
            <button className="btn primary nd-understand" disabled={busy || !raw.trim()} onClick={() => void understand(raw, true)}>
              <Icon name="sparkles" size={15} /> {busy ? t("composeUnderstanding") : t("composeUnderstand")}
            </button>
          </div>
          {hasNarrative && (
            <button className="nd-quiet-link" onClick={() => setPhase("review")}>{t("composeBack")}</button>
          )}
        </div>
      </div>
    );
  }

  // ── Review: advisor mirror + understanding + open questions ─────────────────────────────────────
  if (phase === "review") {
    const q = openQuestions.length;
    const level = q === 0 ? "complete" : q <= 2 ? "good" : "partial";
    const barPct = q === 0 ? 100 : Math.max(30, Math.round((1 - q / 6) * 100));
    return (
      <div className="narrative-input dialogue">
        <div className="nd-review">
          <p className="nd-eyebrow">{t("understoodTitle")}</p>
          {summary.trim()
            ? <p className="nd-summary">{summary}</p>
            : <p className="nd-summary muted">{t("understoodNone")}</p>}

          {q > 0 && (
            <div className="nd-understanding">
              <p className="nd-eyebrow">{t("understandingLabel")}</p>
              <div className="nd-meter"><i style={{ width: `${barPct}%` }} /></div>
              <p className="nd-meter-cap muted">{t(`understandLevel_${level}`)} · {t("openQuestionsN", { count: q })}</p>
              <div className="nd-questions">
                {openQuestions.map((question, i) => (
                  <span className="nd-question" key={i}>{question}</span>
                ))}
              </div>
            </div>
          )}
          {errLine}

          <div className="nd-review-actions">
            <button className="btn primary" disabled={busy} onClick={toInterview}>{t("continueConversation")} →</button>
            {q === 0 && summary.trim() && (
              <button className="btn ghost" disabled={busy} onClick={() => void understand(narrative, false)}>
                {busy ? t("composeUnderstanding") : t("whatsMissing")}
              </button>
            )}
            <button className="btn ghost" disabled={busy} onClick={() => { setRaw(""); setPhase("compose"); }}>{t("redescribe")}</button>
          </div>

          <button className="nd-quiet-link" onClick={() => setShowEditor((v) => !v)}>{t("editDirectly")}</button>
          {showEditor && (
            <textarea className="md nd-editor" value={narrative} onChange={(e) => onNarrative(e.target.value)} spellCheck={false} />
          )}
        </div>
      </div>
    );
  }

  // ── Interview: the existing NarrativeCoach cycle ────────────────────────────────────────────────
  return (
    <div className="narrative-input dialogue">
      <div className="interview">
        <div className="nd-interview-top">
          <button className="nd-quiet-link" onClick={() => setPhase("review")}>← {t("backToSummary")}</button>
          <div className="coach-config">
            <label>
              {t("coachDepth")}
              <select value={config.depth ?? "standard"} disabled={busy} onChange={(e) => onConfig({ ...config, depth: e.target.value as CoachConfig["depth"] })}>
                <option value="brief">{t("depthBrief")}</option>
                <option value="standard">{t("depthStandard")}</option>
                <option value="thorough">{t("depthThorough")}</option>
              </select>
            </label>
          </div>
        </div>

        <div className="chat" ref={chatRef}>
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>{m.content}</div>
          ))}
          {busy && (
            <div className="bubble assistant muted thinking">
              <span className="typing" aria-hidden="true"><i /><i /><i /></span>
              {t("coachThinking")}
            </div>
          )}
        </div>

        {pending && (
          <div className="coach-apply">
            {t("coachDraftReady")} <button onClick={applyPending}>{t("coachApply")}</button>
          </div>
        )}
        {errLine}

        <div className="chat-input">
          <textarea
            value={input}
            placeholder={t("coachPlaceholder")}
            rows={2}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && input.trim() && !busy) void turn(input.trim()); }}
          />
          <div className="chat-actions">
            <button className="send" disabled={busy || !input.trim()} onClick={() => void turn(input.trim())}>{t("coachSend")}</button>
            <button className="gen" disabled={busy} title={ready ? "" : t("coachGenHint")} onClick={() => void turn(t("coachGenerateMsg"))}>
              {t("coachGenerate")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
