/**
 * @kiln/codegen/services — the EXTERNAL SERVICES (delegation) layer.
 *
 * Not every workflow or agent is one we generate and run. Some already EXIST — a commercial lead
 * qualifier, a legal contract reviewer, an existing workflow in another system. You don't generate those;
 * you DELEGATE to them: send data, get a result. Two shapes:
 *   • sync  — call and wait; the result comes back inline (a fast qualifier). Used as a workflow step or
 *             an agent tool.
 *   • async — fire and don't block; the service works (minutes/hours) and CALLS YOU BACK. The callback is
 *             a webhook — i.e. a Trigger — that lands the result: record it via a command, or wake an agent.
 *
 * This declares such services (contract + request/response mapping) and projects the connectors to n8n.
 * Pure + isomorphic; deterministic mock here, an LLM propose pass in @kiln/skills. Endpoints/auth are
 * hand-owned (we generate the skeleton + mapping + the callback wiring, not the vendor's credentials).
 */

import { slug } from "@kiln/ir";
import { attributeSpecs, type CapabilityDoc, type DomainDoc, type WorkflowsDoc, type AgentsDoc } from "@kiln/compiler";
import { commandEndpoint, type N8nWorkflow, type BindingFinding } from "./targets.ts";

export type ServiceKind = "workflow" | "agent";
export type ServiceInvocation = "sync" | "async";
/**
 * How the vendor's credential is presented on the wire. The model NEVER carries the value — only the NAME
 * of the env var holding it (`credentialEnv`), the same stance PB5 takes on `hosting.url`.
 *   • bearer — Authorization: Bearer <value>
 *   • header — <headerName>: <value>            (e.g. X-API-Key)
 *   • basic  — Authorization: Basic base64(<value>), the var holding "user:pass"
 *   • none   — send nothing (the default; unauthenticated vendors + the pre-auth behaviour)
 */
export type ServiceAuth = "bearer" | "header" | "basic" | "none";
export interface ServiceResultTarget {
  kind: "command" | "agent";
  ref: string; // a command id (record the result) or an agent id (react to it)
}
export interface ExternalServiceInput {
  id: string;
  name: string;
  kind: ServiceKind; // an existing external workflow, or an external/commercial agent
  invocation: ServiceInvocation;
  entity?: string; // the model entity it operates on (for mapping + placement)
  endpoint: string; // vendor URL (a placeholder to fill in)
  requestMapping: Record<string, string>; // model field → vendor field
  responseMapping: Record<string, string>; // vendor field → model field
  resultTarget?: ServiceResultTarget; // where the result lands
  rationale?: string;
  // ── auth (all optional — a model authored before this layer round-trips unchanged) ────────────────
  /** NAME of the env var holding the credential (e.g. "CRM_API_TOKEN") — never the value itself. */
  credentialEnv?: string;
  /** the scheme to present it with; omitted = "none" = send nothing (today's behaviour). */
  auth?: ServiceAuth;
  /** for auth: "header" — the header to put the value in (e.g. "X-API-Key"). */
  headerName?: string;
}
export interface ExternalServicesDoc {
  version?: string;
  services: ExternalServiceInput[];
}

const identity = (fields: string[]): Record<string, string> => Object.fromEntries(fields.map((f) => [f, f]));

/**
 * Deterministic candidates grounded in the model: a SYNC qualifier where a qualify/score command exists
 * (a bought lead qualifier), and an ASYNC reviewer where a document entity exists (a contract reviewer
 * that takes a while and calls back). Clearly placeholder endpoints; lean by design. LLM refines.
 */
export function mockExternalServices(caps: CapabilityDoc, domain: DomainDoc, _workflows?: WorkflowsDoc, agents?: AgentsDoc): ExternalServicesDoc {
  void caps;
  const services: ExternalServiceInput[] = [];
  const aggById = new Map(domain.aggregates.map((a) => [a.id, a]));
  const fieldsOf = (entity?: string): string[] => { const a = entity ? aggById.get(entity) : undefined; return a ? attributeSpecs(a).map((f) => slug(f.name)) : []; };

  const qualify = (domain.commands ?? []).find((c) => /qualif|score|assess|screen/.test(c.id));
  if (qualify) {
    const f = fieldsOf(qualify.aggregate);
    services.push({
      id: `svc_lead_qualifier`,
      name: "Lead Qualifier (external)",
      kind: "agent",
      invocation: "sync",
      entity: qualify.aggregate,
      endpoint: "https://api.lead-qualifier.example.com/v1/score",
      requestMapping: identity(f),
      responseMapping: { score: "score", decision: "status", reasons: "notes" },
      resultTarget: { kind: "command", ref: qualify.id }, // record the qualifier's decision
      rationale: "A commercial lead qualifier returns a score fast — call it inline and record the decision.",
    });
  }

  const doc = domain.aggregates.find((a) => /contract|offer|proposal|agreement|quote/.test(a.id));
  if (doc) {
    const f = fieldsOf(doc.id);
    const firstAgent = agents?.agents?.[0];
    services.push({
      id: `svc_${slug(doc.id)}_reviewer`,
      name: `${doc.name || doc.id} Reviewer (external)`,
      kind: "agent",
      invocation: "async",
      entity: doc.id,
      endpoint: "https://api.contract-reviewer.example.com/v1/reviews",
      requestMapping: identity(f),
      responseMapping: { findings: "notes", risk: "status" },
      // slow review → it calls back; wake an agent to act on the findings (else just record).
      resultTarget: firstAgent ? { kind: "agent", ref: slug(firstAgent.id) } : undefined,
      rationale: "A legal reviewer takes minutes/hours — fire it, then react to the findings on callback.",
    });
  }
  return { version: "0.1", services };
}

// A credential embedded in a URL's userinfo (`//user:pass@host`). The same SAFE, non-backtracking pattern
// PB5 uses in targets.ts — bounded character classes, no nested quantifiers.
const URL_USERINFO = /\/\/[^/@:]*:[^/@]*@/;
// An env var NAME (what the model may carry), not a secret VALUE. Conventional UPPER_SNAKE.
const ENV_VAR_NAME = /^[A-Z][A-Z0-9_]*$/;
// A plaintext endpoint + its host, so we can exempt loopback (dev) from the TLS rule.
const PLAIN_HTTP_HOST = /^http:\/\/([^/:?#]+)/i;
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

/**
 * Validate the auth declaration on each external service (XS-series; mirrors the PB-series in targets.ts —
 * same `BindingFinding` shape, same stance: the model carries the env var NAME, the value lives in .env).
 *
 * The credential is the thing that must never land in git, so the errors here are about the MODEL, not the
 * wire: an embedded/pasted secret, a bearer over plaintext, or a scheme that can't actually be sent.
 * Messages never echo the offending value — a validator that prints the secret it caught defeats itself.
 */
export function validateExternalServices(services: ExternalServicesDoc): BindingFinding[] {
  const findings: BindingFinding[] = [];
  for (const s of services.services ?? []) {
    const name = s.name || s.id;
    const scheme = s.auth ?? "none";

    // XS1 — a credential embedded in the endpoint would be committed to model.json + every descriptor.
    if (s.endpoint && URL_USERINFO.test(s.endpoint)) {
      findings.push({ level: "error", code: "XS1", message: `${name}'s endpoint embeds a credential ("user:pass@…"). Declare the env var name in credentialEnv and put the value in .env at deploy time; endpoint must be a scheme+host+path only.` });
    }
    // XS2 — a token pasted where a var NAME belongs. This is the secret-in-git failure the whole layer exists
    // to prevent, so it's an error, and the message must not repeat what was pasted.
    if (s.credentialEnv && !ENV_VAR_NAME.test(s.credentialEnv)) {
      findings.push({ level: "error", code: "XS2", message: `${name}'s credentialEnv does not look like an environment variable name (expected UPPER_SNAKE, e.g. "CRM_API_TOKEN") — it looks like a pasted secret. Declare the var NAME here and put the value in .env; the model is committed to git.` });
    }
    // XS3 — never present a credential over plaintext. Loopback is exempt (local dev against a stub).
    const plain = s.endpoint ? PLAIN_HTTP_HOST.exec(s.endpoint) : null;
    if (s.credentialEnv && plain && !LOOPBACK.test(plain[1])) {
      findings.push({ level: "error", code: "XS3", message: `${name} attaches a credential (${s.credentialEnv}) but its endpoint is plain http:// — the credential would cross the network in the clear. Use https:// (localhost is exempt for dev).` });
    }
    // XS4 — auth: "header" with no header to put the value in: unsendable.
    if (scheme === "header" && !s.headerName) {
      findings.push({ level: "error", code: "XS4", message: `${name} uses auth: "header" but sets no headerName — name the header the vendor expects (e.g. "X-API-Key").` });
    }
    // XS5 — a scheme with no credential to present: the call would go out unauthenticated.
    if (scheme !== "none" && !s.credentialEnv) {
      findings.push({ level: "error", code: "XS5", message: `${name} declares auth: "${scheme}" but no credentialEnv — there is no credential to send. Set credentialEnv to the env var name holding it.` });
    }
    // XS6 — a credential that is never sent. Almost always a half-finished declaration, not a decision.
    if (s.credentialEnv && scheme === "none") {
      findings.push({ level: "warn", code: "XS6", message: `${name} declares credentialEnv (${s.credentialEnv}) but auth: "none", so nothing is sent — set auth to bearer/header/basic, or drop credentialEnv.` });
    }
  }
  return findings;
}

/**
 * Project each service to n8n connectors + a descriptor. Sync → one workflow (call → optionally record).
 * Async → a start workflow (fire) + a callback workflow (webhook → command / wake agent) — the callback
 * IS a trigger, reusing that pattern so the async result lands the same way an external signal does.
 */
export function externalServicesAdapter(services: ExternalServicesDoc, domain: DomainDoc, spineUrl = "http://spine.local/api", agentUrl = "http://agents.local"): { descriptors: Record<string, string>; n8n: N8nWorkflow[] } {
  const cmdById = new Map((domain.commands ?? []).map((c) => [c.id, c]));
  const descriptors: Record<string, string> = {};
  const n8n: N8nWorkflow[] = [];

  const recordNode = (t: ServiceResultTarget | undefined, x: number, y: number): Record<string, unknown> | null => {
    if (!t) return null;
    if (t.kind === "agent") return { parameters: { method: "POST", url: `${agentUrl}/run`, sendBody: true, specifyBody: "json", jsonBody: JSON.stringify({ agent: t.ref, task: "React to the external service's result." }) }, name: `Wake ${t.ref}`, type: "n8n-nodes-base.httpRequest", typeVersion: 4, position: [x, y] };
    const cmd = cmdById.get(t.ref);
    const ep = cmd ? commandEndpoint(cmd) : { method: "POST", path: `/unknown/${slug(t.ref)}` };
    return { parameters: { method: ep.method, url: `${spineUrl}${ep.path}`, sendBody: true }, name: `Record ${cmd?.name || t.ref}`, type: "n8n-nodes-base.httpRequest", typeVersion: 4, position: [x, y] };
  };

  for (const s of services.services ?? []) {
    // The descriptor is committed, so it carries the credential's env var NAME — never its value.
    descriptors[`services/${s.id}.json`] = JSON.stringify(
      { id: s.id, name: s.name, kind: s.kind, invocation: s.invocation, entity: s.entity, endpoint: s.endpoint, auth: s.auth ?? "none", credentialEnv: s.credentialEnv, headerName: s.headerName, requestMapping: s.requestMapping, responseMapping: s.responseMapping, resultTarget: s.resultTarget },
      null,
      2,
    );
    // n8n calls the vendor through its own credential store — the descriptor names the var; a human wires it.
    const authNote = s.credentialEnv && (s.auth ?? "none") !== "none"
      ? `auth: ${s.auth} via the ${s.credentialEnv} credential (set it in n8n's credential store; never inline the value)`
      : "auth: none declared";

    if (s.invocation === "sync") {
      // call & wait: (manual/step) → POST the vendor → optionally record the response via a command.
      const start = { parameters: {}, name: "Call", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [240, 300] };
      const call = { parameters: { method: "POST", url: s.endpoint, sendBody: true, note: `${authNote}; body = requestMapping` }, name: `Call ${s.name}`, type: "n8n-nodes-base.httpRequest", typeVersion: 4, position: [480, 300] };
      const record = recordNode(s.resultTarget, 760, 300);
      const nodes = record ? [start, call, record] : [start, call];
      const connections: Record<string, unknown> = { [start.name]: { main: [[{ node: call.name, type: "main", index: 0 }]] } };
      if (record) connections[call.name] = { main: [[{ node: record.name as string, type: "main", index: 0 }]] };
      n8n.push({ id: `kiln_service_${s.id}`, name: `Service (sync): ${s.name}`, nodes, connections, active: false, settings: { executionOrder: "v1" } });
    } else {
      // fire: kick off the vendor with a callback URL, don't wait.
      const start = { parameters: {}, name: "Fire", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [240, 300] };
      const fire = { parameters: { method: "POST", url: s.endpoint, sendBody: true, note: `${authNote}; body = requestMapping + callbackUrl → the callback webhook below` }, name: `Start ${s.name}`, type: "n8n-nodes-base.httpRequest", typeVersion: 4, position: [480, 300] };
      n8n.push({ id: `kiln_service_${s.id}_start`, name: `Service (async start): ${s.name}`, nodes: [start, fire], connections: { [start.name]: { main: [[{ node: fire.name, type: "main", index: 0 }]] } }, active: false, settings: { executionOrder: "v1" } });
      // callback: the vendor POSTs the result → a Trigger that records it / wakes an agent.
      const hook = { parameters: { httpMethod: "POST", path: `callback/${s.id}` }, name: `Callback ${s.name}`, type: "n8n-nodes-base.webhook", typeVersion: 2, position: [240, 300] };
      const record = recordNode(s.resultTarget, 520, 300) ?? { parameters: { values: { string: [{ name: "result", value: `${s.name} result received` }] } }, name: "Log result", type: "n8n-nodes-base.set", typeVersion: 3, position: [520, 300] };
      n8n.push({ id: `kiln_service_${s.id}_callback`, name: `Service (async callback): ${s.name}`, nodes: [hook, record], connections: { [hook.name]: { main: [[{ node: record.name as string, type: "main", index: 0 }]] } }, active: false, settings: { executionOrder: "v1" } });
    }
  }
  return { descriptors, n8n };
}
