import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CoachConfig } from "@kiln/skills";
import type { CoachMsg as Msg } from "../projects";
import { SERVICE_URL } from "../config";

/**
 * Narrative input with two modes (SPEC-001 §4.1 + user decision): an interactive **Interview**
 * (NarrativeCoach) as the default for founders, and **Markdown** as the paste/advanced tab. Both
 * produce the one artifact — the structured narrative. The interview PROPOSES a narrative; the
 * user applies it (then reviews/edits in Markdown), keeping the human in the loop.
 */
export function NarrativeInput({
  narrative,
  onNarrative,
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
  model: string;
  effort: string;
  /** LLM engine id — routes /api/structure to the selected provider (coach is Anthropic-only). */
  provider?: string;
  config: CoachConfig;
  onConfig: (c: CoachConfig) => void;
  transcript: Msg[];
  onTranscript: (t: Msg[]) => void;
  lang: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const greeting: Msg = { role: "assistant", content: t("coachGreeting") };
  // Persisted transcript excludes the localized greeting; prepend a fresh one for display.
  const [messages, setMessages] = useState<Msg[]>(
    transcript.length ? [greeting, ...transcript] : [greeting],
  );
  const [tab, setTab] = useState<"interview" | "markdown" | "ingest">("interview");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  // Ingest: paste/upload a raw transcript or brief; an LLM structures it into the narrative.
  const [raw, setRaw] = useState("");
  const [structBusy, setStructBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function structure(): Promise<void> {
    if (!raw.trim()) return;
    setStructBusy(true);
    setError(null);
    try {
      const res = await fetch(`${SERVICE_URL}/api/structure`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ raw, model, effort, provider }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (typeof data.narrative === "string" && data.narrative.trim()) {
        onNarrative(data.narrative);
        setTab("markdown"); // review/edit the structured result, then generate capabilities
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStructBusy(false);
    }
  }

  // Auto-scroll the chat to the newest message (and the thinking bubble) as the turn progresses.
  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, pending]);

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
      onTranscript(withReply.slice(1)); // persist without the greeting
      setReady(Boolean(data.readyToGenerate));
      if (typeof data.narrative === "string" && data.narrative.trim()) setPending(data.narrative);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const applyPending = (): void => {
    if (!pending) return;
    onNarrative(pending);
    setPending(null);
    setTab("markdown");
  };

  return (
    <div className="narrative-input">
      <div className="tabs">
        <button className={tab === "interview" ? "active" : ""} onClick={() => setTab("interview")}>{t("tabInterview")}</button>
        <button className={tab === "ingest" ? "active" : ""} onClick={() => setTab("ingest")}>{t("tabIngest")}</button>
        <button className={tab === "markdown" ? "active" : ""} onClick={() => setTab("markdown")}>{t("tabMarkdown")}</button>
      </div>

      {tab === "ingest" ? (
        <div className="ingest">
          <p className="hint">{t("ingestHint")}</p>
          <div className="ingest-actions">
            <button className="gen" disabled={structBusy} onClick={() => fileRef.current?.click()}>{t("ingestFile")}</button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.markdown,.text,text/plain,text/markdown"
              style={{ display: "none" }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setRaw(await f.text());
                e.target.value = "";
              }}
            />
            <button className="send" disabled={structBusy || !raw.trim()} onClick={() => void structure()}>
              {structBusy ? t("structuring") : t("structureBtn")}
            </button>
          </div>
          {error && <p className="err-line"><code>{error}</code> — {t("serviceHint")}</p>}
          <textarea className="md" value={raw} placeholder={t("ingestPlaceholder")} onChange={(e) => setRaw(e.target.value)} spellCheck={false} />
        </div>
      ) : tab === "interview" ? (
        <div className="interview">
          <div className="coach-config">
            <label>
              {t("coachDepth")}
              <select value={config.depth ?? "standard"} disabled={busy} onChange={(e) => onConfig({ ...config, depth: e.target.value as CoachConfig["depth"] })}>
                <option value="brief">{t("depthBrief")}</option>
                <option value="standard">{t("depthStandard")}</option>
                <option value="thorough">{t("depthThorough")}</option>
              </select>
            </label>
            <label className="grow">
              {t("coachDomain")}
              <input
                value={config.domain ?? ""}
                placeholder={t("coachDomainPlaceholder")}
                disabled={busy}
                onChange={(e) => onConfig({ ...config, domain: e.target.value })}
              />
            </label>
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
          {error && <p className="err-line"><code>{error}</code> — {t("serviceHint")}</p>}

          <div className="chat-input">
            <textarea
              value={input}
              placeholder={t("coachPlaceholder")}
              rows={2}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && input.trim() && !busy) void turn(input.trim());
              }}
            />
            <div className="chat-actions">
              <button className="send" disabled={busy || !input.trim()} onClick={() => void turn(input.trim())}>{t("coachSend")}</button>
              <button className="gen" disabled={busy} title={ready ? "" : t("coachGenHint")} onClick={() => void turn(t("coachGenerateMsg"))}>
                {t("coachGenerate")}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <textarea className="md" value={narrative} onChange={(e) => onNarrative(e.target.value)} spellCheck={false} />
      )}
    </div>
  );
}
