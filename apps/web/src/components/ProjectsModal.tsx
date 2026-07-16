// The project manager — every business you're working on, as a gallery. It deliberately reuses the
// ExamplesModal card language (examples-grid / example-card) so "the demos" and "my projects" look like
// one family, and it badges the open project with the same chip the VersionsModal uses. Each card carries
// open / rename / duplicate / export / history / delete; the footer holds the "add a project" actions
// (Import, Load an example, New). Built-in example projects are kept OUT of the list (reachable via "Load
// an example") — except the one currently open, so you never lose access to what you're in. Storage is
// localStorage (+ server sync when reachable) — see projects.ts / projectStore.ts.
import { useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { isExampleProject, type Project } from "../projects";

type T = (k: string, o?: Record<string, unknown>) => string;

export function ProjectsModal({ projects, activeId, locale, serverUp, onOpen, onNew, onAddExample, onImport, onRename, onDuplicate, onExport, onHistory, onDelete, onClose, t }: {
  projects: Project[];
  activeId: string;
  locale: string;
  /** Version history is git-backed (server-only) → the per-card History action only shows when reachable. */
  serverUp: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  onAddExample: () => void;
  onImport: () => void;
  onRename: (id: string) => void;
  onDuplicate: (id: string) => void;
  onExport: (id: string) => void;
  onHistory: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  t: T;
}): React.JSX.Element {
  const editedAt = (ms: number): string =>
    ms ? t("projectEdited", { when: new Date(ms).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" }) }) : t("projectUnedited");
  // "Your projects" = everything except the built-in demos, plus whatever is currently open (so an example
  // you're exploring stays actionable — duplicate it to keep it).
  const mine = projects.filter((p) => p.id === activeId || !isExampleProject(p));
  // Filter by name + description (case-insensitive). Only worth showing once the list is long enough to scan.
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? mine.filter((p) => `${p.name} ${p.description ?? ""}`.toLowerCase().includes(q)) : mine;
  return (
    <Modal title={t("projectsTitle")} onClose={onClose} wide
      footer={<>
        <button className="btn ghost" onClick={onImport}><Icon name="upload" size={15} /> {t("importModel")}</button>
        <button className="btn ghost" onClick={onAddExample}><Icon name="grid" size={15} /> {t("examplesOpen")}</button>
        <button className="btn primary" onClick={onNew}><Icon name="plus" size={15} /> {t("newProject")}</button>
      </>}>
      <p className="modal-message muted">{t("projectsHint")}</p>
      {mine.length > 4 && (
        <div className="modal-search">
          <Icon name="search" size={15} />
          <input autoFocus value={query} placeholder={t("projectsSearch")} onChange={(e) => setQuery(e.target.value)} aria-label={t("projectsSearch")} />
        </div>
      )}
      {shown.length === 0 && <p className="muted" style={{ margin: "14px 2px" }}>{q ? t("projectsNoMatch", { query: query.trim() }) : t("projectsEmpty")}</p>}
      <div className="examples-grid">
        {shown.map((p, i) => {
          const caps = p.capabilities?.capabilities?.length ?? 0;
          const ents = p.domain?.aggregates?.length ?? 0;
          const wf = p.workflows?.workflows?.length ?? 0;
          const current = p.id === activeId;
          return (
            <div key={p.id} className={`example-card project-card accent-${i % 4}${current ? " is-current" : ""}`}>
              {/* Main click target: open this project. Keeping it a distinct button (not the whole card)
                  lets the action row below carry its own buttons — nested buttons are invalid. */}
              <button className="project-card-open" onClick={() => { onOpen(p.id); onClose(); }} title={t("projectOpen")}>
                <span className="example-card-head">
                  <strong>{p.name}</strong>
                  {current && <span className="version-current">{t("projectCurrent")}</span>}
                </span>
                {p.description
                  ? <span className="example-desc">{p.description}</span>
                  : <span className="example-desc muted">{t("projectNoDesc")}</span>}
                <span className="example-stats muted">{t("exampleStats", { caps, ents, wf })} · {editedAt(p.updatedAt)}</span>
              </button>
              <div className="project-card-actions">
                <button onClick={() => onRename(p.id)} title={t("rename")} aria-label={t("rename")}><Icon name="pencil" size={14} /></button>
                <button onClick={() => onDuplicate(p.id)} title={t("projectDuplicate")} aria-label={t("projectDuplicate")}><Icon name="copy" size={14} /></button>
                <button onClick={() => onExport(p.id)} title={t("exportModelHint")} aria-label={t("exportModel")}><Icon name="download" size={14} /></button>
                {serverUp && <button onClick={() => onHistory(p.id)} title={t("versionsOpen")} aria-label={t("versionsOpen")}><Icon name="clock" size={14} /></button>}
                <span className="pt-spacer" />
                <button onClick={() => onDelete(p.id)} disabled={projects.length <= 1} title={t("del")} aria-label={t("del")}><Icon name="trash" size={14} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
