// SPEC-011 M2+M4 — the version timeline for the current project, and a Compare view.
// Timeline: the git history (newest first), each entry label · time · short sha; the newest is the
// working copy, older ones can be Restored (non-destructive) or Compared to the current version.
// Compare runs the pure semantic diff (M3) in the browser over the two versions' models. Server-only:
// opened only when the workspace API is reachable (serverUp).
import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { serverListVersions, serverRestoreVersion, serverGetVersion, type WorkspaceVersion } from "../projectStore";
import { diffModels, type ModelDiff, type DiffModel } from "@kiln/codegen";
import type { Project } from "../projects";

type T = (k: string, o?: Record<string, unknown>) => string;

export function VersionsModal({ projectId, onRestored, onClose, t }: {
  projectId: string;
  onRestored: (p: Project) => void;
  onClose: () => void;
  t: T;
}): React.JSX.Element {
  const [versions, setVersions] = useState<WorkspaceVersion[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // When set, we're showing the diff of `from` (older) vs the current version instead of the list.
  const [diff, setDiff] = useState<{ from: WorkspaceVersion; result: ModelDiff } | null>(null);

  useEffect(() => { void serverListVersions(projectId).then(setVersions); }, [projectId]);

  async function restore(sha: string): Promise<void> {
    setBusy(sha);
    const p = await serverRestoreVersion(projectId, sha);
    setBusy(null);
    if (p) { onRestored(p); onClose(); }
  }

  async function compare(from: WorkspaceVersion): Promise<void> {
    if (!versions?.length) return;
    setBusy(`cmp:${from.sha}`);
    const [a, b] = await Promise.all([
      serverGetVersion(projectId, from.sha),
      serverGetVersion(projectId, versions[0].sha), // the current (newest) version
    ]);
    setBusy(null);
    if (a && b) setDiff({ from, result: diffModels(a as unknown as DiffModel, b as unknown as DiffModel) });
  }

  if (diff) {
    return (
      <Modal title={t("versionsCompareTitle")} onClose={onClose}>
        <button className="btn ghost btn-sm" onClick={() => setDiff(null)}><Icon name="chevronRight" size={13} className="flip" /> {t("versionsBack")}</button>
        <p className="modal-message muted" style={{ marginTop: 8 }}>
          {t("versionsComparing", { label: diff.from.label })}
        </p>
        <DiffView diff={diff.result} t={t} />
      </Modal>
    );
  }

  return (
    <Modal title={t("versionsTitle")} onClose={onClose}>
      <p className="modal-message muted">{t("versionsHint")}</p>
      {versions === null && <p className="muted">{t("versionsLoading")}</p>}
      {versions && versions.length === 0 && <p className="muted">{t("versionsEmpty")}</p>}
      {versions && versions.length > 0 && (
        <ol className="versions-list">
          {versions.map((v, i) => (
            <li key={v.sha} className="version-row">
              <div className="version-main">
                <span className="version-label">
                  {v.label}
                  {i === 0 && <span className="version-current">{t("versionCurrent")}</span>}
                </span>
                <span className="version-meta muted">{new Date(v.at).toLocaleString()} · {v.sha.slice(0, 7)}</span>
              </div>
              {i !== 0 && (
                <div className="version-actions">
                  <button className="btn ghost btn-sm" disabled={!!busy} onClick={() => void compare(v)}>
                    {busy === `cmp:${v.sha}` ? t("versionComparing") : t("versionCompare")}
                  </button>
                  <button className="btn ghost btn-sm" disabled={!!busy} onClick={() => void restore(v.sha)}>
                    {busy === v.sha ? t("versionRestoring") : t("versionRestore")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

// The rendered diff: per changed layer, added / removed / changed with names (+ detail where present).
function DiffView({ diff, t }: { diff: ModelDiff; t: T }): React.JSX.Element {
  if (diff.totalChanges === 0 && !diff.narrativeChanged) {
    return <p className="muted diff-empty">{t("versionsNoDiff")}</p>;
  }
  return (
    <div className="diff-view">
      {diff.narrativeChanged && (
        <div className="diff-layer"><div className="diff-layer-h">{t("narrative")}</div><div className="diff-row diff-changed"><span className="diff-mark">~</span>{t("versionsNarrativeChanged")}</div></div>
      )}
      {diff.layers.map((l) => (
        <div key={l.key} className="diff-layer">
          <div className="diff-layer-h">{t(l.key)}</div>
          {l.added.map((n) => <div key={`a${n}`} className="diff-row diff-added"><span className="diff-mark">+</span>{n}</div>)}
          {l.removed.map((n) => <div key={`r${n}`} className="diff-row diff-removed"><span className="diff-mark">−</span>{n}</div>)}
          {l.changed.map((c) => (
            <div key={`c${c.name}`} className="diff-row diff-changed">
              <span className="diff-mark">~</span>{c.name}
              {c.detail && <span className="diff-detail muted"> · {c.detail}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
