import type { LayerKind, Tier } from "@kiln/skills";
import { Modal } from "./Modal";

// Settings for the AI stages: transparency + control over which MODEL and EFFORT each step runs at.
// Two independent knobs, both opt-in-friendly:
//  · Model per step — off = one global model everywhere; on = pick a model per difficulty tier.
//  · Effort per step — off = one global effort; on = the app's per-layer preset (editable).
// The table shows the net resolved model + effort for every step, so nothing is hidden.

interface ModelOpt { id: string; label: string; supportsEffort: boolean }

interface Props {
  layers: { kind: LayerKind; label: string }[];
  // effort
  adaptiveEffort: boolean;
  effortByLayer: Record<string, string>;
  defaults: Record<string, string>;
  globalEffort: string;
  supportsEffort: boolean;
  efforts: string[];
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
    models, globalModelLabel, adaptiveModel, tierModels, tierOf, modelLabelFor,
    onToggleAdaptive, onSetLayerEffort, onToggleAdaptiveModel, onSetTierModel, onReset, onClose, t } = props;
  const modelSupportsEffort = (id: string): boolean => models.find((m) => m.id === id)?.supportsEffort ?? true;

  return (
    <Modal title={t("settingsTitle")} onClose={onClose} wide
      footer={<>
        <button className="btn ghost" onClick={onReset}>{t("settingsReset")}</button>
        <button className="btn primary" onClick={onClose}>{t("settingsDone")}</button>
      </>}>
      <div className="settings">
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
