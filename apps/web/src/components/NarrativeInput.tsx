import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CoachConfig } from "@vbd/skills";

const SERVICE_URL = "http://localhost:8787";

type Msg = { role: "user" | "assistant"; content: string };

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
  config,
  onConfig,
  lang,
}: {
  narrative: string;
  onNarrative: (v: string) => void;
  model: string;
  effort: string;
  config: CoachConfig;
  onConfig: (c: CoachConfig) => void;
  lang: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"interview" | "markdown">("interview");
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: t("coachGreeting") }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  async function turn(userText: string): Promise<void> {
    const next = [...messages, { role: "user" as const, content: userText }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${SERVICE_URL}/api/coach`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next, model, effort, config: { ...config, language: lang } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setMessages((m) => [...m, { role: "assistant", content: data.reply || "…" }]);
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
        <button className={tab === "markdown" ? "active" : ""} onClick={() => setTab("markdown")}>{t("tabMarkdown")}</button>
      </div>

      {tab === "interview" ? (
        <div className="interview">
          <div className="coach-config">
            <label>
              {t("coachDepth")}
              <select value={config.depth ?? "standard"} onChange={(e) => onConfig({ ...config, depth: e.target.value as CoachConfig["depth"] })}>
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
                onChange={(e) => onConfig({ ...config, domain: e.target.value })}
              />
            </label>
          </div>

          <div className="chat">
            {messages.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>{m.content}</div>
            ))}
            {busy && <div className="bubble assistant muted">{t("coachThinking")}</div>}
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
