import type { LayerKind, Tier } from "@kiln/skills";
import { Modal } from "./Modal";

// Settings for the AI stages: transparency + control over which MODEL and EFFORT each step runs at.
// Two independent knobs, both opt-in-friendly:
//  · Model per step — off = one global model everywhere; on = pick a model per difficulty tier.
//  · Effort per step — off = one global effort; on = the app's per-layer preset (editable).
// The table shows the net resolved model + effort for every step, so nothing is hidden.

interface ModelOpt { id: string; label: string; supportsEffort: boolean }
interface ProviderOpt { id: string; label: string; note?: string; allowCustomModel: boolean }

interface Props {
  layers: { kind: LayerKind; label: string }[];
  // effort
  adaptiveEffort: boolean;
  effortByLayer: Record<string, string>;
  defaults: Record<string, string>;
  globalEffort: string;
  supportsEffort: boolean;
  efforts: string[];
  // engine (LLM provider) — Anthropic default; OpenRouter / omniroute when configured server-side
  providers: ProviderOpt[];
  engine: string;
  globalModel: string;
  onSetEngine: (id: string) => void;
  onSetGlobalModel: (id: string) => void;
  // model
  models: ModelOpt[];
  globalModelLabel: string;
  adaptiveModel: boolean;
  tierModels: { light: string; standard: string; heavy: string };
  tierOf: Record<LayerKind, Tier>;
  modelLabelFor: (kind: LayerKind) => string;
  // handlers
  onToggleAdaptive: (v: boolean) => void;
  onSetLayerEffort: (kind: LayerKind, effort: string) => void;
  onToggleAdaptiveModel: (v: boolean) => void;
  onSetTierModel: (tier: Tier, modelId: string) => void;
  onReset: () => void;
  onClose: () => void;
  t: (k: string, opts?: Record<string, unknown>) => string;
}

const TIERS: Tier[] = ["light", "standard", "heavy"];

export function SettingsModal(props: Props): React.JSX.Element {
  const { layers, adaptiveEffort, effortByLayer, defaults, globalEffort, supportsEffort, efforts,
    providers, engine, globalModel, onSetEngine, onSetGlobalModel,
    models, globalModelLabel, adaptiveModel, tierModels, tierOf, modelLabelFor,
    onToggleAdaptive, onSetLayerEffort, onToggleAdaptiveModel, onSetTierModel, onReset, onClose, t } = props;
  const modelSupportsEffort = (id: string): boolean => models.find((m) => m.id === id)?.supportsEffort ?? true;
  const activeProvider = providers.find((p) => p.id === engine);
  // A saved model id not in the current engine's curated list (e.g. a free-text gateway slug) still shows.
  const knownModel = models.some((m) => m.id === globalModel);

  return (
    <Modal title={t("settingsTitle")} onClose={onClose} wide
      footer={<>
        <button className="btn ghost" onClick={onReset}>{t("settingsReset")}</button>
        <button className="btn primary" onClick={onClose}>{t("settingsDone")}</button>
      </>}>
      <div className="settings">
          {/* ---- Engine (LLM provider) + the global model it runs ---- */}
          <h3 className="settings-h">Engine</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Which AI runs the modeling stages. Anthropic is the default and preferred engine; other engines
            appear here only when their key is set on the server.
          </p>
          {providers.length <= 1 && (
            <p className="muted" style={{ marginTop: 0 }}>
              To add <strong>OpenRouter</strong> or <strong>omniroute</strong> as alternative engines, set
              <code> KILN_OPENROUTER_API_KEY</code> / <code> KILN_OMNIROUTE_API_KEY</code> in your server
              <code> .env</code> and restart the service — a Provider dropdown then appears here.
            </p>
          )}
          <table className="settings-table">
            <tbody>
              {providers.length > 1 && (
                <tr>
                  <td>Provider</td>
                  <td>
                    <select value={engine} onChange={(e) => onSetEngine(e.target.value)}>
                      {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                    {activeProvider?.note && <span className="muted" style={{ marginLeft: 8 }}>{activeProvider.note}</span>}
                  </td>
                </tr>
              )}
              <tr>
                <td>Model</td>
                <td>
                  <select
                    value={knownModel ? globalModel : "__custom__"}
                    onChange={(e) => onSetGlobalModel(e.target.value === "__custom__" ? "" : e.target.value)}
                  >
                    {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    {activeProvider?.allowCustomModel && <option value="__custom__">Custom model id…</option>}
                  </select>
                  {activeProvider?.allowCustomModel && (
                    <input
                      type="text"
                      value={knownModel ? "" : globalModel}
                      placeholder="e.g. openai/gpt-5-mini"
                      onChange={(e) => onSetGlobalModel(e.target.value)}
                      style={{ marginLeft: 8, minWidth: 220 }}
                    />
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          {/* ---- Model per step ---- */}
          <h3 className="settings-h">{t("settingsModelSection")}</h3>
          <label className="settings-toggle">
            <input type="checkbox" checked={adaptiveModel} onChange={(e) => onToggleAdaptiveModel(e.target.checked)} />
            <span><strong>{t("settingsModelAdaptive")}</strong> — {adaptiveModel ? t("settingsModelOnHint") : t("settingsModelOffHint", { model: globalModelLabel })}</span>
          </label>
          {adaptiveModel && (
            <table className="settings-table">
              <thead><tr><th>{t("settingsTier")}</th><th>{t("settingsModel")}</th></tr></thead>
              <tbody>
                {TIERS.map((tier) => (
                  <tr key={tier}>
                    <td>{t(`tier_${tier}`)} <span className="muted">{t(`tier_${tier}_hint`)}</span></td>
                    <td>
                      <select value={tierModels[tier]} onChange={(e) => onSetTierModel(tier, e.target.value)}>
                        {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ---- Effort per step ---- */}
          <h3 className="settings-h">{t("settingsEffortSection")}</h3>
          {!supportsEffort && !adaptiveModel && <p className="muted">{t("settingsNoEffort")}</p>}
          <label className="settings-toggle">
            <input type="checkbox" checked={adaptiveEffort} onChange={(e) => onToggleAdaptive(e.target.checked)} />
            <span><strong>{t("settingsAdaptive")}</strong> — {t("settingsAdaptiveHint")}</span>
          </label>

          {/* ---- Net per-step table (what actually runs) ---- */}
          <table className="settings-table">
            <thead>
              <tr><th>{t("settingsStep")}</th><th>{t("settingsModel")}</th><th>{t("settingsEffort")}</th></tr>
            </thead>
            <tbody>
              {layers.map((l) => {
                const stageModel = adaptiveModel ? tierModels[tierOf[l.kind]] : undefined;
                const canEffort = stageModel ? modelSupportsEffort(stageModel) : supportsEffort;
                const eff = adaptiveEffort ? effortByLayer[l.kind] ?? defaults[l.kind] ?? "high" : globalEffort;
                const overridden = adaptiveEffort && effortByLayer[l.kind] !== undefined && effortByLayer[l.kind] !== defaults[l.kind];
                return (
                  <tr key={l.kind}>
                    <td>{l.label}{adaptiveModel && <span className="settings-tier-tag">{t(`tier_${tierOf[l.kind]}`)}</span>}</td>
                    <td className="muted">{modelLabelFor(l.kind)}</td>
                    <td>
                      {canEffort ? (
                        <>
                          <select value={eff} disabled={!adaptiveEffort} onChange={(e) => onSetLayerEffort(l.kind, e.target.value)}>
                            {efforts.map((ef) => <option key={ef} value={ef}>{ef}</option>)}
                          </select>
                          {overridden && <span className="settings-badge">{t("settingsCustom")}</span>}
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

      </div>
    </Modal>
  );
}
