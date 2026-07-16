import { useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { PlacementEditor } from "./PlacementEditor";
import type { Binding } from "@kiln/codegen";

// AI-stage settings: a GLOBAL default (engine / model / effort) + optional PER-STAGE overrides.
// Any stage can run on a different provider, model and effort than the default — e.g. capabilities on
// Opus/high, entities on a cheap gateway model in low effort. Visual polish is a vision pass, so its
// provider is locked to Anthropic. "(default)" in a cell means "inherit the global default".

interface ModelOpt { id: string; label: string; supportsEffort: boolean }
interface ProviderOpt { id: string; label: string; note?: string; allowCustomModel: boolean; models: ModelOpt[] }
interface StageRow { key: string; label: string; description?: string; lockProvider?: string }
interface Override { provider?: string; model?: string; effort?: string }
type Field = "provider" | "model" | "effort";

interface Props {
  providers: ProviderOpt[]; // only the engines configured on the server
  efforts: string[];
  defaultEngine: string;
  defaultModel: string;
  defaultEffort: string;
  /** Adaptive Anthropic defaults on/off (model+effort per stage by tier). */
  adaptive: boolean;
  onSetAdaptive: (v: boolean) => void;
  /** Deep link to the docs page explaining engines/models/stages. */
  docsUrl?: string;
  stages: StageRow[];
  overrides: Record<string, Override>;
  resolvedFor: (key: string) => { provider: string; model: string; effort: string };
  onSetDefault: (field: Field, value: string) => void;
  onSetStage: (key: string, field: Field, value: string | undefined) => void;
  onReset: () => void;
  onClose: () => void;
  /** SPEC-012 — the project's execution-topology binding + a writer, for the deployment-placement editor. */
  binding: Binding | null | undefined;
  onBindingChange: (next: Binding) => void;
  /** UI language (i18n) — moved here from the sidebar so Settings owns all app-level preferences. */
  language: string;
  languages: readonly string[];
  onSetLanguage: (lng: string) => void;
  t: (k: string, opts?: Record<string, unknown>) => string;
}

type Tab = "ai" | "deploy" | "general";

export function SettingsModal(props: Props): React.JSX.Element {
  const { providers, efforts, defaultEngine, defaultModel, defaultEffort, adaptive, onSetAdaptive, docsUrl, stages, overrides, resolvedFor, onSetDefault, onSetStage, onReset, onClose, binding, onBindingChange, language, languages, onSetLanguage, t } = props;
  const [tab, setTab] = useState<Tab>("general");
  const providerOf = (id: string): ProviderOpt | undefined => providers.find((p) => p.id === id);
  const providerLabel = (id: string): string => providerOf(id)?.label ?? id;
  const modelLabel = (providerId: string, modelId: string): string => providerOf(providerId)?.models.find((m) => m.id === modelId)?.label ?? modelId;
  const modelHasEffort = (providerId: string, modelId: string): boolean => providerOf(providerId)?.models.find((m) => m.id === modelId)?.supportsEffort ?? true;

  const dprov = providerOf(defaultEngine);
  const defKnown = dprov?.models.some((m) => m.id === defaultModel) ?? false;
  const defHasEffort = modelHasEffort(defaultEngine, defaultModel);
  const adaptiveApplies = defaultEngine === "anthropic"; // adaptive tiers only fire on Anthropic stages

  const hasOverrides = Object.keys(overrides).length > 0;
  const [expanded, setExpanded] = useState(hasOverrides);

  const tabs: { id: Tab; label: string }[] = [
    { id: "general", label: t("settingsTabGeneral") },
    { id: "ai", label: t("settingsTabAi") },
    { id: "deploy", label: t("settingsTabDeploy") },
  ];

  return (
    <Modal title={t("settingsTitle")} onClose={onClose} wide
      footer={<>
        {/* Reset only concerns the AI tab's per-stage overrides — hide it elsewhere so it can't mislead. */}
        {tab === "ai" && <button className="btn ghost" onClick={onReset}>{t("settingsReset")}</button>}
        <button className="btn primary" onClick={onClose}>{t("settingsDone")}</button>
      </>}>
      <div className="settings-tabs" role="tablist">
        {tabs.map((tb) => (
          <button key={tb.id} role="tab" aria-selected={tab === tb.id} className={tab === tb.id ? "active" : ""} onClick={() => setTab(tb.id)}>
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "ai" && (
        <div className="settings">
          {/* ---- The default engine / model / effort ---- */}
          <h3 className="settings-h" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            Engine &amp; models
            {docsUrl && <a className="settings-doclink" href={docsUrl} target="_blank" rel="noreferrer">Learn more ↗</a>}
          </h3>
          <p className="muted" style={{ marginTop: 0 }}>
            The engine, model and effort every stage uses unless you override it below. Anthropic is the
            default and preferred engine; other engines appear when their key is set on the server.
          </p>
          {providers.length <= 1 && (
            <p className="muted" style={{ marginTop: 0 }}>
              To add <strong>OpenRouter</strong> or <strong>omniroute</strong>, set
              <code> KILN_OPENROUTER_API_KEY</code> / <code> KILN_OMNIROUTE_API_KEY</code> in your server
              <code> .env</code> and restart the service.
            </p>
          )}
          <table className="settings-table">
            <tbody>
              {providers.length > 1 && (
                <tr>
                  <td>Provider</td>
                  <td>
                    <select value={defaultEngine} onChange={(e) => onSetDefault("provider", e.target.value)}>
                      {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                    {dprov?.note && <span className="muted" style={{ marginLeft: 8 }}>{dprov.note}</span>}
                  </td>
                </tr>
              )}
              <tr>
                <td>Model</td>
                <td>
                  <select value={defKnown ? defaultModel : "__custom__"} onChange={(e) => onSetDefault("model", e.target.value === "__custom__" ? "" : e.target.value)}>
                    {dprov?.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    {dprov?.allowCustomModel && <option value="__custom__">Custom model id…</option>}
                  </select>
                  {dprov?.allowCustomModel && (
                    <input type="text" value={defKnown ? "" : defaultModel} placeholder="e.g. openai/gpt-5-mini" onChange={(e) => onSetDefault("model", e.target.value)} style={{ marginLeft: 8, minWidth: 220 }} />
                  )}
                </td>
              </tr>
              <tr>
                <td>Effort</td>
                <td>
                  {defHasEffort ? (
                    <select value={defaultEffort} onChange={(e) => onSetDefault("effort", e.target.value)}>
                      {efforts.map((ef) => <option key={ef} value={ef}>{ef}</option>)}
                    </select>
                  ) : <span className="muted">— (this model has no effort control)</span>}
                </td>
              </tr>
              <tr>
                <td>Adaptive</td>
                <td>
                  {/* The tiers only fire on stages that run on Anthropic. When the default engine is a
                      gateway, the toggle is a no-op for those stages → disable it and say so plainly. */}
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: adaptiveApplies ? "pointer" : "not-allowed", opacity: adaptiveApplies ? 1 : 0.55 }}>
                    <input type="checkbox" checked={adaptive} disabled={!adaptiveApplies} onChange={(e) => onSetAdaptive(e.target.checked)} />
                    <span>Pick model &amp; effort per stage on Anthropic</span>
                  </label>
                  <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                    {adaptiveApplies ? (
                      <>heavy reasoning (capabilities, business areas, automations) → <strong>Opus · high</strong>;
                      standard (behaviour, workflows) → <strong>Sonnet</strong>; light (entities, roles, agents) →
                      <strong> Haiku</strong>. Off = every stage uses the default model above.</>
                    ) : (
                      <><strong>Anthropic only.</strong> Your engine is <strong>{providerLabel(defaultEngine)}</strong>,
                      so every stage uses the default model above. (Still applies to any stage you override to
                      Anthropic below.)</>
                    )}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          {adaptive && adaptiveApplies && (
            <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>
              With Adaptive on, the default <strong>Model</strong> above is the fallback for non-Anthropic
              engines; Anthropic stages follow the tiers. Any per-stage override below still wins.
            </p>
          )}

          {/* ---- Per-stage overrides (progressive disclosure) ---- */}
          <h3 className="settings-h" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            Per stage
            <button className="btn ghost" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => setExpanded((v) => !v)}>
              {expanded ? "hide" : "customize"}
            </button>
          </h3>
          {expanded && (
            <>
              <p className="muted" style={{ marginTop: 0 }}>
                Override any stage's provider / model / effort. Leave a cell on <em>(default)</em> to inherit the
                default above. Example: capabilities on Opus, entities on a cheap gateway model in low effort.
              </p>
              <table className="settings-table">
                <thead><tr><th>Stage</th><th>Provider</th><th>Model</th><th>Effort</th></tr></thead>
                <tbody>
                  {stages.map((st) => {
                    const ov = overrides[st.key] ?? {};
                    const rowProvider = st.lockProvider ?? ov.provider ?? defaultEngine;
                    const p = providerOf(rowProvider);
                    const res = resolvedFor(st.key);
                    const effOk = modelHasEffort(res.provider, res.model);
                    const modelInList = ov.model && (p?.models.some((m) => m.id === ov.model) ?? false);
                    return (
                      <tr key={st.key}>
                        <td>
                          <span className="settings-stage-name">
                            {st.label}
                            {st.description && (
                              <span className="tip-wrap" tabIndex={0} aria-label={st.description}>
                                <Icon name="info" size={13} className="tip-icon" />
                                <span className="tip" role="tooltip">{st.description}</span>
                              </span>
                            )}
                          </span>
                        </td>
                        <td>
                          {st.lockProvider ? (
                            <span className="muted" title="Visual polish is a vision pass — Anthropic only">🔒 {providerLabel(st.lockProvider)} · vision</span>
                          ) : providers.length > 1 ? (
                            <select value={ov.provider ?? ""} onChange={(e) => onSetStage(st.key, "provider", e.target.value || undefined)}>
                              <option value="">(default: {providerLabel(defaultEngine)})</option>
                              {providers.map((pr) => <option key={pr.id} value={pr.id}>{pr.label}</option>)}
                            </select>
                          ) : <span className="muted">{providerLabel(defaultEngine)}</span>}
                        </td>
                        <td>
                          <select value={modelInList ? (ov.model as string) : ""} onChange={(e) => onSetStage(st.key, "model", e.target.value || undefined)}>
                            <option value="">(default: {modelLabel(res.provider, res.model)})</option>
                            {p?.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                          </select>
                        </td>
                        <td>
                          {effOk ? (
                            <select value={ov.effort ?? ""} onChange={(e) => onSetStage(st.key, "effort", e.target.value || undefined)}>
                              <option value="">(default: {res.effort})</option>
                              {efforts.map((ef) => <option key={ef} value={ef}>{ef}</option>)}
                            </select>
                          ) : <span className="muted">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {tab === "deploy" && (
        <div className="settings">
          {/* ---- Deployment placement (SPEC-012) ---- */}
          <PlacementEditor binding={binding} onChange={onBindingChange} />
        </div>
      )}

      {tab === "general" && (
        <div className="settings">
          <h3 className="settings-h">{t("language")}</h3>
          <p className="muted" style={{ marginTop: 0 }}>{t("settingsLanguageHint")}</p>
          <div className="lang">
            {languages.map((lng) => (
              <button key={lng} className={language === lng ? "active" : ""} onClick={() => onSetLanguage(lng)}>
                {lng.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
