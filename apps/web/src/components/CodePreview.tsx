import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { generateAll, generateApp } from "@vbd/codegen";
import type { CapabilityDoc, DomainDoc, ContextsDoc, RolesDoc, WorkflowsDoc, AgentsDoc } from "@vbd/compiler";
import type { CodeFinding } from "@vbd/skills";
import { downloadZip } from "../zip";

/**
 * Read-only "generated code" preview — the payoff of the whole model (RES-001): a deterministic
 * projection to TypeScript types, an OpenAPI operation sketch (real commands, not just CRUD), the
 * area→module map, and the remaining-gap report. Text is truth; this is a projection, never edited.
 */
export function CodePreview({
  caps,
  domain,
  contexts,
  roles,
  workflows,
  agents,
  requestAppLogic,
  requestCodeReview,
  onClose,
}: {
  caps: CapabilityDoc;
  domain: DomainDoc;
  contexts: ContextsDoc;
  roles: RolesDoc;
  workflows: WorkflowsDoc;
  agents: AgentsDoc;
  requestAppLogic: () => Promise<{ handlers: Record<string, string>; written: number; skipped: number }>;
  requestCodeReview: (handlerCode?: Record<string, string>) => Promise<CodeFinding[]>;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [review, setReview] = useState<CodeFinding[] | null>(null);
  const zipName = `${(caps.domain || "business").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-app.zip`;

  async function exportApp(withAI: boolean): Promise<void> {
    setExporting(true);
    setExportNote(null);
    try {
      const handlers = withAI ? (await requestAppLogic()) : null;
      downloadZip(generateApp(caps, domain, contexts, roles, handlers?.handlers), zipName);
      if (handlers) setExportNote(t("exportAppAiNote", { written: handlers.written, total: handlers.written + handlers.skipped }));
    } catch (e) {
      setExportNote(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  async function reviewCode(): Promise<void> {
    setReviewing(true);
    setExportNote(null);
    try {
      setReview(await requestCodeReview());
    } catch (e) {
      setExportNote(e instanceof Error ? e.message : String(e));
    } finally {
      setReviewing(false);
    }
  }
  const report = useMemo(() => generateAll(caps, domain, contexts, roles, workflows, agents), [caps, domain, contexts, roles, workflows, agents]);
  type Tab = "types" | "api" | "modules" | "events" | "reactions" | "permissions" | "processes" | "agents" | "app" | "deploy" | "mcp" | "react";
  const [tab, setTab] = useState<Tab>("types");
  const TABS: Tab[] = ["types", "api", "mcp", "react", "modules", "events", "reactions", "permissions", "processes", "agents", "app", "deploy"];

  const apiOps = Object.entries(report.openapi.paths as Record<string, Record<string, { summary?: string; "x-emits"?: string[] }>>)
    .flatMap(([path, ops]) => Object.entries(ops).map(([verb, op]) => ({ path, verb, op })))
    .filter((x) => !x.verb.startsWith("get"));

  return (
    <div className="code-preview">
      <div className="code-head">
        <div className="code-tabs">
          {TABS.map((k) => (
            <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{t(`code_${k}`)}</button>
          ))}
        </div>
        <span className="code-export-group">
          {exportNote && <span className="code-export-note muted">{exportNote}</span>}
          <button className="code-export ghost" onClick={() => void reviewCode()} disabled={reviewing || exporting} title={t("codeReviewHint")}>
            {reviewing ? t("generating") : `🔍 ${t("codeReview")}`}
          </button>
          <button className="code-export ghost" onClick={() => void exportApp(false)} disabled={exporting} title={t("exportAppHint")}>
            ⬇ {t("exportApp")}
          </button>
          <button className="code-export" onClick={() => void exportApp(true)} disabled={exporting} title={t("exportAppAiHint")}>
            {exporting ? t("generating") : `✨ ${t("exportAppAi")}`}
          </button>
        </span>
        <button className="nd-close" onClick={onClose} aria-label="close">×</button>
      </div>

      {review && (
        <div className="code-review">
          <div className="code-review-head">
            🔍 {t("codeReviewTitle")}
            {review.length === 0 && <span className="muted"> — {t("codeReviewClean")}</span>}
            <button className="nd-close" onClick={() => setReview(null)} aria-label="close">×</button>
          </div>
          <ul className="code-review-findings">
            {review.map((f) => (
              <li key={f.id}>
                <code className={`sev-${f.severity}`}>{f.severity}</code>
                <code className="lens">{t(`lens_${f.lens}`)}</code>
                <span className="cr-file">{f.file}</span>
                <div className="cr-msg">{f.message}{f.suggestion && <span className="review-fix"> → {f.suggestion}</span>}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="code-body">
        {tab === "types" && <pre className="code-block">{report.types}</pre>}
        {tab === "api" && (
          <ul className="code-ops">
            {apiOps.map(({ path, verb, op }, i) => (
              <li key={i}>
                <code className="op-verb">{verb.split("_")[0].toUpperCase()}</code> <code>{path}</code>
                <span className="muted"> {op.summary}</span>
                {(op["x-emits"] ?? []).length > 0 && <span className="op-emits"> → {(op["x-emits"] ?? []).join(", ")}</span>}
              </li>
            ))}
          </ul>
        )}
        {tab === "modules" && <pre className="code-block">{report.moduleMap}</pre>}
        {tab === "reactions" && <pre className="code-block">{report.reactionHandlers}</pre>}
        {tab === "permissions" && <pre className="code-block">{report.permissions}</pre>}
        {tab === "processes" && <pre className="code-block">{report.processes}</pre>}
        {tab === "agents" && <pre className="code-block">{report.agents}</pre>}
        {tab === "app" && <pre className="code-block">{report.appBlueprint}</pre>}
        {tab === "deploy" && <pre className="code-block">{report.deployBlueprint}</pre>}
        {tab === "mcp" && <pre className="code-block">{report.mcp}</pre>}
        {tab === "react" && <pre className="code-block">{report.react}</pre>}
        {tab === "events" && (
          <ul className="code-ops">
            {report.events.map((e, i) => (
              <li key={i}>
                <code>{String(e.name)}</code> <span className="muted">[{String(e.entity)}]</span> ({String(e.trigger)})
                {Array.isArray(e.emittedBy) && e.emittedBy.length > 0 && <span className="op-emits"> ← {(e.emittedBy as string[]).join(", ")}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {report.gaps.length > 0 && (
        <ul className="code-gaps">
          {report.gaps.map((g, i) => <li key={i}><span className="muted">◇</span> {g}</li>)}
        </ul>
      )}
    </div>
  );
}
