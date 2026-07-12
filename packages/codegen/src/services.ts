/**
 * @vbd/codegen/services — the EXTERNAL SERVICES (delegation) layer.
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
 * Pure + isomorphic; deterministic mock here, an LLM propose pass in @vbd/skills. Endpoints/auth are
 * hand-owned (we generate the skeleton + mapping + the callback wiring, not the vendor's credentials).
 */

import { slug } from "@vbd/ir";
import { attributeSpecs, type CapabilityDoc, type DomainDoc, type WorkflowsDoc, type AgentsDoc } from "@vbd/compiler";
import { commandEndpoint, type N8nWorkflow } from "./targets.ts";

export type ServiceKind = "workflow" | "agent";
export type ServiceInvocation = "sync" | "async";
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
    descriptors[`services/${s.id}.json`] = JSON.stringify(
      { id: s.id, name: s.name, kind: s.kind, invocation: s.invocation, entity: s.entity, endpoint: s.endpoint, requestMapping: s.requestMapping, responseMapping: s.responseMapping, resultTarget: s.resultTarget },
      null,
      2,
    );

    if (s.invocation === "sync") {
      // call & wait: (manual/step) → POST the vendor → optionally record the response via a command.
      const start = { parameters: {}, name: "Call", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [240, 300] };
      const call = { parameters: { method: "POST", url: s.endpoint, sendBody: true, note: "TODO: auth; body = requestMapping" }, name: `Call ${s.name}`, type: "n8n-nodes-base.httpRequest", typeVersion: 4, position: [480, 300] };
      const record = recordNode(s.resultTarget, 760, 300);
      const nodes = record ? [start, call, record] : [start, call];
      const connections: Record<string, unknown> = { [start.name]: { main: [[{ node: call.name, type: "main", index: 0 }]] } };
      if (record) connections[call.name] = { main: [[{ node: record.name as string, type: "main", index: 0 }]] };
      n8n.push({ id: `vbd_service_${s.id}`, name: `Service (sync): ${s.name}`, nodes, connections, active: false, settings: { executionOrder: "v1" } });
    } else {
      // fire: kick off the vendor with a callback URL, don't wait.
      const start = { parameters: {}, name: "Fire", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [240, 300] };
      const fire = { parameters: { method: "POST", url: s.endpoint, sendBody: true, note: "TODO: auth; body = requestMapping + callbackUrl → the callback webhook below" }, name: `Start ${s.name}`, type: "n8n-nodes-base.httpRequest", typeVersion: 4, position: [480, 300] };
      n8n.push({ id: `vbd_service_${s.id}_start`, name: `Service (async start): ${s.name}`, nodes: [start, fire], connections: { [start.name]: { main: [[{ node: fire.name, type: "main", index: 0 }]] } }, active: false, settings: { executionOrder: "v1" } });
      // callback: the vendor POSTs the result → a Trigger that records it / wakes an agent.
      const hook = { parameters: { httpMethod: "POST", path: `callback/${s.id}` }, name: `Callback ${s.name}`, type: "n8n-nodes-base.webhook", typeVersion: 2, position: [240, 300] };
      const record = recordNode(s.resultTarget, 520, 300) ?? { parameters: { values: { string: [{ name: "result", value: `${s.name} result received` }] } }, name: "Log result", type: "n8n-nodes-base.set", typeVersion: 3, position: [520, 300] };
      n8n.push({ id: `vbd_service_${s.id}_callback`, name: `Service (async callback): ${s.name}`, nodes: [hook, record], connections: { [hook.name]: { main: [[{ node: record.name as string, type: "main", index: 0 }]] } }, active: false, settings: { executionOrder: "v1" } });
    }
  }
  return { descriptors, n8n };
}
