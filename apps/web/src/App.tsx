import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  parseNarrative,
  validateNarrative,
  businessOutcomes,
  coreActivities,
  customers,
} from "@vbd/narrative";
import { compileCapabilities, type CapabilityDoc, type CapabilityInput } from "@vbd/compiler";
import { validateAll } from "@vbd/validation";
import { mockGenerateCapabilities } from "@vbd/skills";
import { CapabilityMap } from "./components/CapabilityMap";
import { NodeDetail } from "./components/NodeDetail";
import { NarrativeInput } from "./components/NarrativeInput";
import {
  loadProjects,
  saveProjects,
  newProject,
  type Project,
  type ProjectState,
} from "./projects";

const SERVICE_URL = "http://localhost:8787";

const MODELS = [
  { id: "claude-sonnet-5", label: "Sonnet 5", supportsEffort: true },
  { id: "claude-opus-4-8", label: "Opus 4.8", supportsEffort: true },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", supportsEffort: false },
];
const EFFORTS = ["low", "medium", "high", "max"];

function FindingsBadge({ count }: { count: number }): React.JSX.Element {
  const { t } = useTranslation();
  const ok = count === 0;
  return <span className={`badge ${ok ? "ok" : "warn"}`}>{ok ? t("clean") : t("findingsCount", { count })}</span>;
}

export default function App(): React.JSX.Element {
  const { t, i18n } = useTranslation();

  // ---- Projects (localStorage, ADR-005) ----
  const [state, setState] = useState<ProjectState>(() => loadProjects());
  useEffect(() => saveProjects(state), [state]);
  const active = state.projects.find((p) => p.id === state.activeId) ?? state.projects[0];

  const patchActive = (patch: Partial<Project>): void =>
    setState((s) => ({
      ...s,
      projects: s.projects.map((p) => (p.id === s.activeId ? { ...p, ...patch, updatedAt: Date.now() } : p)),
    }));

  // ---- Transient UI state ----
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [spend, setSpend] = useState<{
    estCostUsd: number;
    sessionSpendUsd: number;
    usage: { input: number; output: number };
  } | null>(null);

  const text = active.narrative;
  const doc = useMemo(() => parseNarrative(text), [text]);
  const narrativeFindings = useMemo(() => validateNarrative(doc), [doc]);

  const mockDoc = useMemo(() => mockGenerateCapabilities(doc), [doc]);
  const activeDoc = active.capabilities ?? mockDoc;
  const ir = useMemo(() => compileCapabilities(activeDoc), [activeDoc]);
  const capFindings = useMemo(() => validateAll(activeDoc), [activeDoc]);

  function setNarrative(v: string): void {
    // Editing invalidates a prior LLM snapshot → fall back to the live mock.
    patchActive({ narrative: v, capabilities: null, provider: null });
    setSelected(null);
  }

  async function generate(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${SERVICE_URL}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ narrative: text, model: active.model, effort: active.effort }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      patchActive({ capabilities: data.doc as CapabilityDoc, provider: data.provider as string });
      setSpend({ estCostUsd: data.estCostUsd, sessionSpendUsd: data.sessionSpendUsd, usage: data.usage });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- Capability editing (structured forms, REV-004 F1) ----
  // Editing materializes the live mock into the project's own capabilities, then patches it.
  function editCapability(updated: CapabilityInput): void {
    const base = active.capabilities ?? mockDoc;
    const caps = base.capabilities.map((c) => (c.id === updated.id ? updated : c));
    patchActive({ capabilities: { ...base, capabilities: caps }, provider: "hand-edited" });
  }
  function deleteCapability(id: string): void {
    const base = active.capabilities ?? mockDoc;
    patchActive({
      capabilities: { ...base, capabilities: base.capabilities.filter((c) => c.id !== id) },
      provider: "hand-edited",
    });
    setSelected(null);
  }
  function addCapability(): void {
    const base = active.capabilities ?? mockDoc;
    let n = base.capabilities.length + 1;
    let id = `capability_${n}`;
    while (base.capabilities.some((c) => c.id === id)) id = `capability_${++n}`;
    const cap: CapabilityInput = { id, name: "New Capability", purpose: "", outcomes: [] };
    patchActive({ capabilities: { ...base, capabilities: [...base.capabilities, cap] }, provider: "hand-edited" });
    setSelected(id);
  }

  // ---- Project actions ----
  function addProject(): void {
    const name = window.prompt(t("newProjectPrompt"), "");
    if (name === null) return;
    const p = newProject(name);
    setState((s) => ({ projects: [...s.projects, p], activeId: p.id }));
    setSelected(null);
  }
  function renameProject(): void {
    const name = window.prompt(t("renamePrompt"), active.name);
    if (name === null || !name.trim()) return;
    patchActive({ name: name.trim() });
  }
  function deleteProject(): void {
    if (state.projects.length <= 1) return;
    if (!window.confirm(`${t("deleteConfirm")} "${active.name}"`)) return;
    setState((s) => {
      const remaining = s.projects.filter((p) => p.id !== s.activeId);
      return { projects: remaining, activeId: remaining[0].id };
    });
    setSelected(null);
  }

  const supportsEffort = MODELS.find((m) => m.id === active.model)?.supportsEffort ?? true;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>{t("appTitle")}</h1>
          <p className="tagline">{t("tagline")}</p>
        </div>

        <div className="projectbar">
          <span className="muted">{t("project")}:</span>
          <select
            value={active.id}
            onChange={(e) => {
              setState((s) => ({ ...s, activeId: e.target.value }));
              setSelected(null);
            }}
          >
            {state.projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button onClick={addProject}>+ {t("newProject")}</button>
          <button onClick={renameProject}>{t("rename")}</button>
          <button onClick={deleteProject} disabled={state.projects.length <= 1}>{t("del")}</button>
        </div>

        <div className="lang">
          <span>{t("language")}:</span>
          {(["de", "en"] as const).map((lng) => (
            <button key={lng} className={i18n.language === lng ? "active" : ""} onClick={() => void i18n.changeLanguage(lng)}>
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
          <NarrativeInput
            key={active.id}
            narrative={text}
            onNarrative={setNarrative}
            model={active.model}
            effort={active.effort}
            config={active.coachConfig ?? {}}
            onConfig={(c) => patchActive({ coachConfig: c })}
            lang={i18n.language}
          />
          {narrativeFindings.length > 0 && (
            <ul className="findings">
              {narrativeFindings.map((f) => (
                <li key={f.id}><code>{f.code}</code> {f.message}</li>
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
                <span className="muted">#{s.anchor} · {s.items.length} {t("items")}</span>
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
              <select value={active.model} onChange={(e) => patchActive({ model: e.target.value })}>
                {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label>
              {t("effort")}
              <select value={active.effort} onChange={(e) => patchActive({ effort: e.target.value })} disabled={!supportsEffort}>
                {EFFORTS.map((ef) => <option key={ef} value={ef}>{ef}</option>)}
              </select>
            </label>
            <button className="generate" onClick={() => void generate()} disabled={busy}>
              {busy ? t("generating") : t("generateBtn")}
            </button>
            <button className="addcap" onClick={addCapability}>{t("addCap")}</button>
          </div>

          <p className="hint">
            {t("source")}: <strong>{active.provider ?? t("mockLabel")}</strong> · {t("generatedNote")} · {t("ndHint")}
          </p>
          {spend && (
            <p className="spend" title={t("creditNote")}>
              💳 ${spend.estCostUsd.toFixed(4)} {t("thisCall")} · ${spend.sessionSpendUsd.toFixed(4)} {t("thisSession")}
              <span className="muted"> · {spend.usage.input + spend.usage.output} {t("tokens")}</span>
              <br />
              <span className="muted">{t("creditNote")}</span>
            </p>
          )}
          {error && <p className="err-line"><code>{error}</code> — {t("serviceHint")}</p>}

          <div className="map-wrap">
            <CapabilityMap ir={ir} selectedId={selected} onSelect={setSelected} />
            <NodeDetail
              doc={activeDoc}
              selectedId={selected}
              onEdit={editCapability}
              onDelete={deleteCapability}
              onClose={() => setSelected(null)}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
