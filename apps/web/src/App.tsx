import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  parseNarrative,
  validateNarrative,
  businessOutcomes,
  coreActivities,
  customers,
} from "@vbd/narrative";
import { compileCapabilities, type CapabilityDoc } from "@vbd/compiler";
import { validateAll } from "@vbd/validation";
import { mockGenerateCapabilities } from "@vbd/skills";
import { narrativeMd } from "./data/solar";
import { CapabilityMap } from "./components/CapabilityMap";

// The service holds the Anthropic key and runs the real model (ADR-003/004).
const SERVICE_URL = "http://localhost:8787";

// Mirrors the service catalog (apps/service/src/models.ts). Effort is unsupported on Haiku.
const MODELS = [
  { id: "claude-sonnet-5", label: "Sonnet 5", supportsEffort: true },
  { id: "claude-opus-4-8", label: "Opus 4.8", supportsEffort: true },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", supportsEffort: false },
];
const EFFORTS = ["low", "medium", "high", "max"];

function FindingsBadge({ count }: { count: number }): React.JSX.Element {
  const { t } = useTranslation();
  const ok = count === 0;
  return (
    <span className={`badge ${ok ? "ok" : "warn"}`}>
      {ok ? t("clean") : t("findingsCount", { count })}
    </span>
  );
}

export default function App(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [text, setText] = useState(narrativeMd);

  // Model selection (default: "sonnet medium").
  const [model, setModel] = useState("claude-sonnet-5");
  const [effort, setEffort] = useState("medium");
  const supportsEffort = MODELS.find((m) => m.id === model)?.supportsEffort ?? true;

  // LLM-generated capabilities (on demand); falls back to the offline mock.
  const [llmDoc, setLlmDoc] = useState<CapabilityDoc | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spend, setSpend] = useState<{
    estCostUsd: number;
    sessionSpendUsd: number;
    usage: { input: number; output: number };
  } | null>(null);

  const doc = useMemo(() => parseNarrative(text), [text]);
  const narrativeFindings = useMemo(() => validateNarrative(doc), [doc]);

  // Editing the narrative invalidates a prior LLM snapshot → fall back to the live mock.
  useEffect(() => {
    setLlmDoc(null);
    setProvider(null);
  }, [text]);

  const mockDoc = useMemo(() => mockGenerateCapabilities(doc), [doc]);
  const activeDoc = llmDoc ?? mockDoc;
  const ir = useMemo(() => compileCapabilities(activeDoc), [activeDoc]);
  const capFindings = useMemo(() => validateAll(activeDoc), [activeDoc]);

  async function generate(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${SERVICE_URL}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ narrative: text, model, effort }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setLlmDoc(data.doc as CapabilityDoc);
      setProvider(data.provider as string);
      setSpend({ estCostUsd: data.estCostUsd, sessionSpendUsd: data.sessionSpendUsd, usage: data.usage });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>{t("appTitle")}</h1>
          <p className="tagline">{t("tagline")}</p>
        </div>
        <div className="lang">
          <span>{t("language")}:</span>
          {(["de", "en"] as const).map((lng) => (
            <button
              key={lng}
              className={i18n.language === lng ? "active" : ""}
              onClick={() => void i18n.changeLanguage(lng)}
            >
              {lng.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <main className="cols">
        <section className="col">
          <div className="col-head">
            <h2>{t("narrative")}</h2>
            <FindingsBadge count={narrativeFindings.length} />
          </div>
          <p className="hint">{t("narrativeHint")}</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
          {narrativeFindings.length > 0 && (
            <ul className="findings">
              {narrativeFindings.map((f) => (
                <li key={f.id}>
                  <code>{f.code}</code> {f.message}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="col">
          <div className="col-head">
            <h2>{t("sections")}</h2>
            <span className="muted">{doc.title}</span>
          </div>
          <ul className="sections">
            {doc.sections.map((s) => (
              <li key={s.anchor}>
                <span className="s-head">{s.heading}</span>
                <span className="muted">
                  #{s.anchor} · {s.items.length} {t("items")}
                </span>
              </li>
            ))}
          </ul>
          <div className="lists">
            <div>
              <h3>{t("outcomes")}</h3>
              <ul>{businessOutcomes(doc).map((o) => <li key={o}>{o}</li>)}</ul>
            </div>
            <div>
              <h3>{t("activities")}</h3>
              <ul>{coreActivities(doc).map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
            <div>
              <h3>{t("customers")}</h3>
              <ul>{customers(doc).map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          </div>
        </section>

        <section className="col grow">
          <div className="col-head">
            <h2>{t("capabilities")}</h2>
            <FindingsBadge count={capFindings.length} />
          </div>

          <div className="genbar">
            <label>
              {t("model")}
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </label>
            <label>
              {t("effort")}
              <select value={effort} onChange={(e) => setEffort(e.target.value)} disabled={!supportsEffort}>
                {EFFORTS.map((ef) => (
                  <option key={ef} value={ef}>{ef}</option>
                ))}
              </select>
            </label>
            <button className="generate" onClick={() => void generate()} disabled={busy}>
              {busy ? t("generating") : t("generateBtn")}
            </button>
          </div>

          <p className="hint">
            {t("source")}: <strong>{provider ?? t("mockLabel")}</strong> · {t("generatedNote")}
          </p>
          {spend && (
            <p className="spend" title={t("creditNote")}>
              💳 ${spend.estCostUsd.toFixed(4)} {t("thisCall")} · ${spend.sessionSpendUsd.toFixed(4)}{" "}
              {t("thisSession")}
              <span className="muted">
                {" "}
                · {spend.usage.input + spend.usage.output} {t("tokens")}
              </span>
              <br />
              <span className="muted">{t("creditNote")}</span>
            </p>
          )}
          {error && (
            <p className="err-line">
              <code>{error}</code> — {t("serviceHint")}
            </p>
          )}

          <CapabilityMap ir={ir} />
        </section>
      </main>
    </div>
  );
}
