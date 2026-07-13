// The example gallery as an in-app picker — so the four demo verticals stay reachable even after a user
// has their own projects (the first-run seed only fires on empty storage). Picking one adds a fresh copy
// and switches to it. Every example now ships a fully-baked model, so each card shows how rich it is
// (capabilities · entities · workflows) plus the ingestion path its narrative came from.
import { useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { exampleProjects, type Project } from "../projects";

type T = (k: string, o?: Record<string, unknown>) => string;

// Strip the "example (…)" wrapper the provider carries → just the ingestion path (e.g. "from a Zoom transcript").
const ingestPath = (provider?: string | null): string =>
  (provider ?? "").replace(/^example\s*\(/i, "").replace(/\)\s*$/, "").trim();

export function ExamplesModal({ onPick, onClose, t }: { onPick: (p: Project) => void; onClose: () => void; t: T }): React.JSX.Element {
  // Build the gallery once (fresh ids per mount); pick hands the chosen Project up to App.
  const [examples] = useState(() => exampleProjects());
  return (
    <Modal title={t("examplesTitle")} onClose={onClose}>
      <p className="modal-message muted">{t("examplesHint")}</p>
      <div className="examples-grid">
        {examples.map((ex, i) => {
          const caps = ex.capabilities?.capabilities?.length ?? 0;
          const ents = ex.domain?.aggregates?.length ?? 0;
          const wf = ex.workflows?.workflows?.length ?? 0;
          const path = ingestPath(ex.provider);
          return (
            <button key={ex.id} className={`example-card accent-${i % 4}`} onClick={() => { onPick(ex); onClose(); }}>
              <div className="example-card-head">
                <strong>{ex.name.replace(/\s*\(.*\)\s*$/, "")}</strong>
                {path && <span className="example-path">{path}</span>}
              </div>
              {ex.description && <p className="example-desc">{ex.description}</p>}
              <div className="example-stats muted">{t("exampleStats", { caps, ents, wf })}</div>
              <span className="example-go"><Icon name="plus" size={13} /> {t("exampleLoad")}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
