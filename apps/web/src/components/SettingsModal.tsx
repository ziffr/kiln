import type { LayerKind } from "@vbd/skills";

// Settings for the AI review: transparency + control over which effort each step runs at. The MODEL
// is always the one picked at the top (shown here read-only); effort is what adapts per layer, and
// the user can turn the adaptation off or override any layer's preset.

interface Props {
  layers: { kind: LayerKind; label: string }[];
  adaptiveEffort: boolean;
  effortByLayer: Record<string, string>;
  defaults: Record<string, string>;
  globalEffort: string;
  modelLabel: string;
  supportsEffort: boolean;
  efforts: string[];
  onToggleAdaptive: (v: boolean) => void;
  onSetLayerEffort: (kind: LayerKind, effort: string) => void;
  onReset: () => void;
  onClose: () => void;
  t: (k: string, opts?: Record<string, unknown>) => string;
}

export function SettingsModal({ layers, adaptiveEffort, effortByLayer, defaults, globalEffort, modelLabel, supportsEffort, efforts, onToggleAdaptive, onSetLayerEffort, onReset, onClose, t }: Props): React.JSX.Element {
  return (
    <div className="guide-overlay" onClick={onClose}>
      <div className="guide settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="guide-head">
          <h2>⚙︎ {t("settingsTitle")}</h2>
          <button className="nd-close" onClick={onClose} aria-label="close">×</button>
        </div>
        <div className="guide-body">
          <p className="muted">{t("settingsModelNote", { model: modelLabel })}</p>
          {!supportsEffort && <p className="muted">{t("settingsNoEffort")}</p>}

          <label className="settings-toggle">
            <input type="checkbox" checked={adaptiveEffort} onChange={(e) => onToggleAdaptive(e.target.checked)} disabled={!supportsEffort} />
            <span><strong>{t("settingsAdaptive")}</strong> — {t("settingsAdaptiveHint")}</span>
          </label>

          <table className="settings-table">
            <thead>
              <tr><th>{t("settingsStep")}</th><th>{t("settingsEffort")}</th></tr>
            </thead>
            <tbody>
              {layers.map((l) => {
                const eff = adaptiveEffort ? effortByLayer[l.kind] ?? defaults[l.kind] ?? "high" : globalEffort;
                const overridden = adaptiveEffort && effortByLayer[l.kind] !== undefined && effortByLayer[l.kind] !== defaults[l.kind];
                return (
                  <tr key={l.kind}>
                    <td>{l.label}</td>
                    <td>
                      <select
                        value={eff}
                        disabled={!adaptiveEffort || !supportsEffort}
                        onChange={(e) => onSetLayerEffort(l.kind, e.target.value)}
                      >
                        {efforts.map((ef) => <option key={ef} value={ef}>{ef}</option>)}
                      </select>
                      {overridden && <span className="settings-badge">{t("settingsCustom")}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="settings-actions">
            <button className="review-btn" onClick={onReset}>{t("settingsReset")}</button>
            <button className="generate" onClick={onClose}>{t("settingsDone")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
