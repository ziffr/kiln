import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { generateAll } from "@vbd/codegen";
import type { CapabilityDoc, DomainDoc, ContextsDoc } from "@vbd/compiler";

/**
 * Read-only "generated code" preview — the payoff of the whole model (RES-001): a deterministic
 * projection to TypeScript types, an OpenAPI operation sketch (real commands, not just CRUD), the
 * area→module map, and the remaining-gap report. Text is truth; this is a projection, never edited.
 */
export function CodePreview({
  caps,
  domain,
  contexts,
  onClose,
}: {
  caps: CapabilityDoc;
  domain: DomainDoc;
  contexts: ContextsDoc;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const report = useMemo(() => generateAll(caps, domain, contexts), [caps, domain, contexts]);
  const [tab, setTab] = useState<"types" | "api" | "modules" | "events" | "workflows">("types");

  const apiOps = Object.entries(report.openapi.paths as Record<string, Record<string, { summary?: string; "x-emits"?: string[] }>>)
    .flatMap(([path, ops]) => Object.entries(ops).map(([verb, op]) => ({ path, verb, op })))
    .filter((x) => !x.verb.startsWith("get"));

  return (
    <div className="code-preview">
      <div className="code-head">
        <div className="code-tabs">
          {(["types", "api", "modules", "events", "workflows"] as const).map((k) => (
            <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{t(`code_${k}`)}</button>
          ))}
        </div>
        <button className="nd-close" onClick={onClose} aria-label="close">×</button>
      </div>

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
        {tab === "workflows" && <pre className="code-block">{report.workflows}</pre>}
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
