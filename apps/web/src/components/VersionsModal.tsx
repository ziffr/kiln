// SPEC-011 M2 — the version timeline for the current project. Lists the git history of the workspace
// (newest first), each entry = label · time · short sha. The newest is the working copy; any older one
// can be restored (non-destructive — the state you restore over stays in history). Server-only: opened
// only when the workspace API is reachable (serverUp), so the hosted/offline app never shows it empty.
import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { serverListVersions, serverRestoreVersion, type WorkspaceVersion } from "../projectStore";
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

  useEffect(() => { void serverListVersions(projectId).then(setVersions); }, [projectId]);

  async function restore(sha: string): Promise<void> {
    setBusy(sha);
    const p = await serverRestoreVersion(projectId, sha);
    setBusy(null);
    if (p) { onRestored(p); onClose(); }
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
                <button className="btn ghost btn-sm" disabled={busy === v.sha} onClick={() => void restore(v.sha)}>
                  {busy === v.sha ? t("versionRestoring") : t("versionRestore")}
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
