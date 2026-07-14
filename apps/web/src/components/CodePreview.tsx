import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { generateAll, generateApp, assembleFullStack } from "@kiln/codegen";
import type { CapabilityDoc, DomainDoc, ContextsDoc, RolesDoc, WorkflowsDoc, AgentsDoc } from "@kiln/compiler";
import type { CodeFinding } from "@kiln/skills";
import type { ModelDoc } from "../model";
import { downloadZip } from "../zip";
import { Icon } from "./Icon";

export interface VerifyVerdict {
  ok?: boolean;
  configured?: boolean;
  error?: string;
  checks?: { name: string; ok: boolean; detail: string }[];
}

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
  requestAppComponents,
  requestVerify,
  requestRun,
  requestPolishUi,
  requestPolishVisual,
  requestCodeReview,
  buildModel,
  onClose,
}: {
  caps: CapabilityDoc;
  domain: DomainDoc;
  contexts: ContextsDoc;
  roles: RolesDoc;
  workflows: WorkflowsDoc;
  agents: AgentsDoc;
  requestAppLogic: (feedback?: string) => Promise<{ handlers: Record<string, string>; written: number; skipped: number }>;
  requestAppComponents: () => Promise<{ views: Record<string, unknown>; written: number; skipped: number }>;
  requestVerify: (files: Record<string, string>) => Promise<VerifyVerdict>;
  requestRun?: (files: Record<string, string>, views?: Record<string, unknown>) => Promise<{ uiUrl: string; id: string }>;
  requestPolishUi?: (views: Record<string, unknown>) => Promise<{ views: Record<string, unknown>; improvements: Record<string, string[]> }>;
  requestPolishVisual?: (views: Record<string, unknown>) => Promise<{ views: Record<string, unknown>; improvements: Record<string, string[]>; unavailable?: boolean; error?: string }>;
  requestCodeReview: (handlerCode?: Record<string, string>) => Promise<CodeFinding[]>;
  buildModel: () => ModelDoc; // the COMPLETE model (all layers) — for the full-stack export
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [auto, setAuto] = useState(false);
  const [review, setReview] = useState<CodeFinding[] | null>(null);
  const [handlers, setHandlers] = useState<Record<string, string> | null>(null); // AI-written logic, improved by fixes
  const [views, setViews] = useState<Record<string, unknown> | null>(null); // AI-designed per-entity screen specs
  const [verifying, setVerifying] = useState(false);
  const [autoVerifying, setAutoVerifying] = useState(false);
  const [verdict, setVerdict] = useState<VerifyVerdict | null>(null);
  const [running, setRunning] = useState(false);
  const [runUrl, setRunUrl] = useState<string | null>(null);
  const [polishing, setPolishing] = useState(false);
  const [visualPolishing, setVisualPolishing] = useState(false);
  // A proposed UX pass awaiting review: the improved specs + per-screen rationale + which screens to apply.
  const [polish, setPolish] = useState<{ views: Record<string, unknown>; improvements: Record<string, string[]> } | null>(null);
  const [polishAccept, setPolishAccept] = useState<Record<string, boolean>>({});
  const autoStop = useRef(false);
  const zipName = `${(caps.domain || "business").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-app.zip`;
  const busy = exporting || reviewing || fixing || auto || verifying || autoVerifying || running || polishing || visualPolishing;

  // Phase-2 VISUAL pass: the service boots the app, screenshots each screen, and Claude vision critiques
  // what it SEES → improved specs. Same review panel as the structural pass. Local-only (needs a browser).
  async function polishVisual(): Promise<void> {
    if (!requestPolishVisual) return;
    setVisualPolishing(true);
    setExportNote(null);
    try {
      const res = await requestPolishVisual((views as Record<string, unknown>) ?? {});
      if (res.unavailable) { setExportNote(res.error ?? "Visual polish is unavailable."); return; }
      setPolish({ views: res.views, improvements: res.improvements });
      setPolishAccept(Object.fromEntries(Object.keys(res.improvements).map((id) => [id, true])));
    } catch (e) {
      setExportNote(e instanceof Error ? e.message : String(e));
    } finally {
      setVisualPolishing(false);
    }
  }

  // Automated UX pass: a "senior designer" agent critiques + improves every screen's view spec against the
  // Kiln design rubric, iterating to best practices. The result is REVIEWED (per-screen accept) before it
  // touches the app — model proposes, human decides. Applying merges accepted specs into the live views.
  async function polishUi(): Promise<void> {
    if (!requestPolishUi) return;
    setPolishing(true);
    setExportNote(null);
    try {
      const res = await requestPolishUi((views as Record<string, unknown>) ?? {});
      setPolish(res);
      // Default: accept every screen that actually changed something.
      setPolishAccept(Object.fromEntries(Object.keys(res.improvements).map((id) => [id, true])));
    } catch (e) {
      setExportNote(e instanceof Error ? e.message : String(e));
    } finally {
      setPolishing(false);
    }
  }

  function applyPolish(): void {
    if (!polish) return;
    // Merge only the accepted screens' improved specs over the current views.
    const next: Record<string, unknown> = { ...(views ?? {}) };
    for (const [id, spec] of Object.entries(polish.views)) if (polishAccept[id] !== false) next[id] = spec;
    setViews(next);
    setPolish(null);
    const n = Object.values(polishAccept).filter(Boolean).length;
    setExportNote(`Applied the UX pass to ${n} screen${n === 1 ? "" : "s"} — Run app or export to see it.`);
  }

  // Run the generated app locally: POST the assembled files to the service, which boots the zero-dep
  // Node/SQLite server and returns a live preview URL — opened in a new tab (the "see the outcome" loop).
  async function runApp(): Promise<void> {
    if (!requestRun) return;
    setRunning(true);
    setExportNote(null);
    try {
      const { uiUrl } = await requestRun(currentFiles(), (views as never) ?? undefined);
      setRunUrl(uiUrl);
      window.open(uiUrl, "_blank", "noopener");
    } catch (e) {
      setExportNote(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  // The exact files that would be exported right now (incl. any AI handlers/screens applied).
  const currentFiles = (): Record<string, string> => generateApp(caps, domain, contexts, roles, handlers ?? undefined, (views as never) ?? undefined);

  async function verifyApp(): Promise<void> {
    setVerifying(true);
    setExportNote(null);
    try {
      setVerdict(await requestVerify(currentFiles()));
    } catch (e) {
      setExportNote(e instanceof Error ? e.message : String(e));
    } finally {
      setVerifying(false);
    }
  }

  // Auto fix-and-re-verify: build → run in the sandbox → if a check fails, feed it back into handler
  // regeneration → re-verify, up to 3 rounds, stopping when the app builds and runs clean. Closes the
  // generate → build → run → fix loop. Threads handlers locally (React state is async).
  async function autoVerify(): Promise<void> {
    setAutoVerifying(true);
    setExportNote(null);
    let hc = handlers ?? undefined;
    try {
      for (let round = 0; round < 3; round++) {
        const v = await requestVerify(generateApp(caps, domain, contexts, roles, hc, (views as never) ?? undefined));
        setVerdict(v);
        if (v.configured === false) { setExportNote(t("verifyNotConfigured")); break; }
        const failing = (v.checks ?? []).filter((c) => !c.ok);
        if (v.ok || failing.length === 0) break; // clean → done
        const feedback = `The generated app failed these runtime checks — fix the handler logic so they pass:\n${failing.map((c) => `- ${c.name}: ${c.detail}`).join("\n")}`;
        const r = await requestAppLogic(feedback);
        hc = { ...(hc ?? {}), ...r.handlers };
        setHandlers(hc);
      }
    } catch (e) {
      setExportNote(e instanceof Error ? e.message : String(e));
    } finally {
      setAutoVerifying(false);
    }
  }

  const feedbackFrom = (fs: CodeFinding[]): string =>
    fs.map((f) => `[${f.severity}/${f.lens}] ${f.file}: ${f.message}${f.suggestion ? ` → ${f.suggestion}` : ""}`).join("\n");

  async function exportApp(withAI: boolean): Promise<void> {
    setExporting(true);
    setExportNote(null);
    try {
      let hc = handlers;
      let vs = views;
      if (withAI) {
        // Fan out both — the AI writes the handler logic and designs each entity's screen, concurrently.
        const [logic, comp] = await Promise.all([hc ? Promise.resolve(null) : requestAppLogic(), vs ? Promise.resolve(null) : requestAppComponents()]);
        if (logic) { hc = logic.handlers; setHandlers(hc); }
        if (comp) { vs = comp.views; setViews(vs); }
        setExportNote(t("exportAppAiNote2", { handlers: Object.keys(hc ?? {}).length, screens: Object.keys(vs ?? {}).length }));
      }
      downloadZip(generateApp(caps, domain, contexts, roles, withAI ? hc ?? undefined : undefined, withAI ? (vs as never) ?? undefined : undefined), zipName);
    } catch (e) {
      setExportNote(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  // Full-stack export: the COMPLETE multi-backend repo (Postgres/SQLite + spine + n8n + Odoo + shadcn UI +
  // agents + docker-compose + Dockerfiles + all docs/plumbing) — the same bytes the CLI exporter writes,
  // assembled in the browser via the pure assembleFullStack(). Includes any AI-drafted handlers already applied.
  async function exportFullStack(): Promise<void> {
    setExporting(true);
    setExportNote(null);
    try {
      const m = buildModel();
      const dialect = m.binding?.defaults?.store === "sqlite" ? "sqlite" : "postgres";
      const { files, report } = assembleFullStack({
        version: m.version,
        capabilities: m.capabilities,
        contexts: m.contexts,
        domain: m.domain,
        roles: m.roles,
        workflows: m.workflows,
        agents: m.agents,
        theme: m.theme,
        binding: m.binding,
        dialect,
        handlers: handlers ?? undefined,
        comms: m.comms,
        integrations: m.integrations,
        triggers: m.triggers,
        services: m.services,
        i18n: m.i18n,
        modelPath: "model.json",
        gitInitialized: false, // a browser zip isn't a git repo — the README tells the user to run `git init`
      });
      downloadZip(files, `${(caps.domain || "business").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-fullstack.zip`);
      setExportNote(t("exportFullStackNote", { files: Object.keys(files).length, dialect }));
      void report; // the projection report (coverage/validation/gaps) — surfaced in the tabs already
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
      setReview(await requestCodeReview(handlers ?? undefined));
    } catch (e) {
      setExportNote(e instanceof Error ? e.message : String(e));
    } finally {
      setReviewing(false);
    }
  }

  // Fix loop: regenerate the handler logic addressing the current findings, then re-review to confirm.
  async function applyFixes(): Promise<void> {
    if (!review || review.length === 0) return;
    setFixing(true);
    setExportNote(null);
    try {
      const r = await requestAppLogic(feedbackFrom(review));
      const hc = { ...(handlers ?? {}), ...r.handlers };
      setHandlers(hc);
      setReview(await requestCodeReview(hc));
    } catch (e) {
      setExportNote(e instanceof Error ? e.message : String(e));
    } finally {
      setFixing(false);
    }
  }

  // Auto: review → fix → re-review, up to 2 rounds, stopping when clean. Threads handlers locally
  // (React state is async) so each re-review sees the just-applied fixes.
  async function autoFix(): Promise<void> {
    setAuto(true);
    autoStop.current = false;
    setExportNote(null);
    try {
      let hc = handlers ?? undefined;
      for (let round = 0; round < 2; round++) {
        const findings = await requestCodeReview(hc);
        setReview(findings);
        if (findings.length === 0 || autoStop.current) break;
        const r = await requestAppLogic(feedbackFrom(findings));
        hc = { ...(hc ?? {}), ...r.handlers };
        setHandlers(hc);
      }
    } catch (e) {
      setExportNote(e instanceof Error ? e.message : String(e));
    } finally {
      setAuto(false);
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
        {/* Two clusters: Check (review/verify + their auto-fix pairs) | Export (increasing completeness,
            full-stack is the single primary). Icons over emoji; one accent CTA, the rest ghost. */}
        <span className="code-export-group">
          {exportNote && <span className="code-export-note muted">{exportNote}</span>}
          <button className="code-export ghost" onClick={() => void reviewCode()} disabled={busy} title={t("codeReviewHint")}>
            <Icon name="search" size={14} />{reviewing ? t("generating") : t("codeReview")}
          </button>
          <button className="code-export ghost" onClick={() => void autoFix()} disabled={busy} title={t("codeReviewAutoHint")}>
            <Icon name="wrench" size={14} />{auto ? t("generating") : t("codeReviewAuto")}
          </button>
          <button className="code-export ghost" onClick={() => void verifyApp()} disabled={busy} title={t("verifyHint")}>
            <Icon name="beaker" size={14} />{verifying ? t("verifyBusy") : t("verifyApp")}
          </button>
          <button className="code-export ghost" onClick={() => void autoVerify()} disabled={busy} title={t("verifyAutoHint")}>
            <Icon name="refresh" size={14} />{autoVerifying ? t("generating") : t("verifyAuto")}
          </button>
          {requestPolishUi && (
            <button className="code-export ghost" onClick={() => void polishUi()} disabled={busy} title="A designer agent critiques + improves every screen (hierarchy, formats, badges, hidden ids) in the Kiln design language — you review before it applies">
              <Icon name="sparkles" size={14} />{polishing ? "Polishing…" : "Polish UI"}
            </button>
          )}
          {requestPolishVisual && (
            <button className="code-export ghost" onClick={() => void polishVisual()} disabled={busy} title="Visual pass: boots the app, screenshots each screen, and an AI critiques what it actually SEES (layout, balance, boards vs tables) — needs a local Chrome">
              <Icon name="eye" size={14} />{visualPolishing ? "Looking…" : "Visual polish"}
            </button>
          )}
          {requestRun && (
            <button className="code-export" onClick={() => void runApp()} disabled={busy} title="Boot the generated app locally and open it in a new tab">
              <Icon name="play" size={14} />{running ? "Starting…" : "Run app"}
            </button>
          )}
          {runUrl && !running && (
            <a className="code-export ghost" href={runUrl} target="_blank" rel="noopener noreferrer" title="Reopen the running preview">
              <Icon name="globe" size={14} />Open preview
            </a>
          )}
          <span className="code-export-sep" aria-hidden="true" />
          <button className="code-export ghost" onClick={() => void exportApp(false)} disabled={busy} title={t("exportAppHint")}>
            <Icon name="download" size={14} />{t("exportApp")}
          </button>
          <button className="code-export ghost" onClick={() => void exportApp(true)} disabled={busy} title={t("exportAppAiHint")}>
            <Icon name="sparkles" size={14} />{exporting ? t("generating") : t("exportAppAi")}
          </button>
          <button className="code-export" onClick={() => void exportFullStack()} disabled={busy} title={t("exportFullStackHint")}>
            <Icon name="package" size={14} />{exporting ? t("generating") : t("exportFullStack")}
          </button>
        </span>
        <button className="nd-close" onClick={onClose} aria-label="close">×</button>
      </div>

      {verdict && (
        <div className="code-review">
          <div className="code-review-head">
            <Icon name="beaker" size={15} /> {t("verifyTitle")}
            {verdict.configured === false ? <span className="muted"> — {t("verifyNotConfigured")}</span>
              : verdict.ok ? <span className="cr-pass"> — {t("verifyPass")}</span>
                : <span className="cr-fail"> — {t("verifyFail")}</span>}
            <button className="nd-close" onClick={() => setVerdict(null)} aria-label="close">×</button>
          </div>
          {verdict.error && <p className="code-review-advisory">{verdict.error}</p>}
          {verdict.checks && (
            <ul className="verify-checks">
              {verdict.checks.map((c) => (
                <li key={c.name}><code className={c.ok ? "sev-low" : "sev-high"}>{c.ok ? "✓" : "✗"}</code> <span className="cr-file">{c.name}</span> <span className="muted">{c.detail}</span></li>
              ))}
            </ul>
          )}
        </div>
      )}

      {polish && (
        <div className="code-review">
          <div className="code-review-head">
            <Icon name="sparkles" size={15} /> UX pass — review the improvements
            <button className="nd-close" onClick={() => setPolish(null)} aria-label="close">×</button>
          </div>
          {Object.keys(polish.improvements).length === 0 ? (
            <p className="code-review-advisory">Every screen already follows the design best practices — nothing to change.</p>
          ) : (
            <>
              <ul className="verify-checks">
                {Object.entries(polish.improvements).map(([id, notes]) => {
                  const name = domain.aggregates.find((a) => a.id === id)?.name ?? id;
                  return (
                    <li key={id}>
                      <label style={{ display: "flex", gap: 8, alignItems: "baseline", cursor: "pointer" }}>
                        <input type="checkbox" checked={polishAccept[id] !== false} onChange={(e) => setPolishAccept((p) => ({ ...p, [id]: e.target.checked }))} />
                        <span><strong>{name}</strong>
                          <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                            {notes.map((n, i) => <li key={i} className="muted">{n}</li>)}
                          </ul>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="code-export" onClick={() => applyPolish()} disabled={busy}><Icon name="check" size={14} />Apply</button>
                <button className="code-export ghost" onClick={() => setPolish(null)} disabled={busy}>Discard</button>
              </div>
            </>
          )}
        </div>
      )}

      {review && (
        <div className="code-review">
          <div className="code-review-head">
            <Icon name="search" size={15} /> {t("codeReviewTitle")}
            {review.length === 0 && <span className="muted"> — {t("codeReviewClean")}</span>}
            {review.length > 0 && (
              <button className="code-export refine" onClick={() => void applyFixes()} disabled={busy}>
                {fixing ? t("generating") : <><Icon name="wrench" size={13} /> {t("codeReviewFix", { count: review.length })}</>}
              </button>
            )}
            <button className="nd-close" onClick={() => setReview(null)} aria-label="close">×</button>
          </div>
          <p className="code-review-advisory">⚠ {t("codeReviewAdvisory")}</p>
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
