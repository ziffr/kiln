// The example gallery as an in-app picker — so the four demo verticals stay reachable even after a user
// has their own projects (the first-run seed only fires on empty storage). Picking one adds a fresh copy
// and switches to it.
import { useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { exampleProjects, type Project } from "../projects";

type T = (k: string, o?: Record<string, unknown>) => string;

export function ExamplesModal({ onPick, onClose, t }: { onPick: (p: Project) => void; onClose: () => void; t: T }): React.JSX.Element {
  // Build the gallery once (fresh ids per mount); pick hands the chosen Project up to App.
  const [examples] = useState(() => exampleProjects());
  return (
    <Modal title={t("examplesTitle")} onClose={onClose}>
      <p className="modal-message muted">{t("examplesHint")}</p>
      <div className="examples-grid">
        {examples.map((ex) => (
          <button key={ex.id} className="example-card" onClick={() => { onPick(ex); onClose(); }}>
            <div className="example-card-head">
              <strong>{ex.name.replace(/\s*\(.*\)\s*$/, "")}</strong>
              <span className={`example-badge ${ex.capabilities ? "ready" : "gen"}`}>
                {ex.capabilities ? t("exampleReady") : t("exampleGenerate")}
              </span>
            </div>
            {ex.description && <p className="example-desc">{ex.description}</p>}
            {ex.provider && <span className="example-provider muted">{ex.provider}</span>}
            <span className="example-go"><Icon name="plus" size={13} /> {t("exampleLoad")}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
