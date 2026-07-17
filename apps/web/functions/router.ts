/**
 * Single catch-all serverless function for Vercel (bundled to `api/[...path].js`).
 *
 * Vercel plans cap the number of Serverless Functions, and we have 25 API handlers — one per file would
 * exceed the cap (and error the deploy). So instead of one function per file, ALL routes are served by
 * this ONE function: it imports every handler and dispatches on the request path. build-functions.mjs
 * bundles only this file (with every `@kiln/*` handler inlined) → a single `api/[...path].js`.
 *
 * The handlers themselves (agents.ts, generate.ts, …) are unchanged — each still `export default (req,res)`.
 */
import type { Req, Res } from "./_lib.ts";
import agents from "./agents.ts";
import agentRun from "./agent-run.ts";
import agentPromptRevise from "./agent-prompt-revise.ts";
import appComponents from "./app-components.ts";
import appLogic from "./app-logic.ts";
import coach from "./coach.ts";
import codeReview from "./code-review.ts";
import communications from "./communications.ts";
import contexts from "./contexts.ts";
import critique from "./critique.ts";
import domain from "./domain.ts";
import enrichLayer from "./enrich-layer.ts";
import enrichWeb from "./enrich-web.ts";
import enrich from "./enrich.ts";
import events from "./events.ts";
import externalServices from "./external-services.ts";
import generate from "./generate.ts";
import integrations from "./integrations.ts";
import models from "./models.ts";
import orchestration from "./orchestration.ts";
import policies from "./policies.ts";
import polishUi from "./polish-ui.ts";
import roles from "./roles.ts";
import structure from "./structure.ts";
import summary from "./summary.ts";
import understand from "./understand.ts";
import translate from "./translate.ts";
import usage from "./usage.ts";
import verify from "./verify.ts";
import workflows from "./workflows.ts";

type Handler = (req: Req, res: Res) => unknown;
/** The real Vercel request carries `url`/`query` (the minimal `Req` type doesn't); widen for routing. */
type RouterReq = Req & { url?: string; query?: Record<string, string | string[] | undefined> };

// route name (the path segment after /api/) → handler. Names match the old per-file endpoints exactly.
const routes: Record<string, Handler> = {
  agents,
  "agent-run": agentRun,
  "agent-prompt-revise": agentPromptRevise,
  "app-components": appComponents,
  "app-logic": appLogic,
  coach,
  "code-review": codeReview,
  communications,
  contexts,
  critique,
  domain,
  "enrich-layer": enrichLayer,
  "enrich-web": enrichWeb,
  enrich,
  events,
  "external-services": externalServices,
  generate,
  integrations,
  models,
  orchestration,
  policies,
  "polish-ui": polishUi,
  roles,
  structure,
  summary,
  understand,
  translate,
  usage,
  verify,
  workflows,
};

export default function handler(req: RouterReq, res: Res): unknown {
  // Catch-all: Vercel sets req.query.path = [segment(s)]; fall back to parsing the URL path.
  const q = req.query?.path;
  let name = Array.isArray(q) ? q[q.length - 1] : (typeof q === "string" ? q : undefined);
  if (!name) {
    const p = (req.url || "").split("?")[0].replace(/\/+$/, "");
    name = p.split("/").filter(Boolean).pop() ?? "";
  }
  const h = routes[name];
  if (!h) {
    res.status(404).json({ error: `no api route: ${name}` });
    return;
  }
  return h(req as Req, res);
}
