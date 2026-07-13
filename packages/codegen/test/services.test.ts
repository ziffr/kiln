import { test } from "node:test";
import assert from "node:assert/strict";
import { mockExternalServices, externalServicesAdapter, agentsAdapter, projectTargets, DEFAULT_BINDING } from "../src/index.ts";
import type { CapabilityDoc, DomainDoc, AgentsDoc } from "@kiln/compiler";

const caps: CapabilityDoc = { domain: "Solar", capabilities: [{ id: "sales", name: "Sales", purpose: "", outcomes: [] }] } as unknown as CapabilityDoc;
const domain: DomainDoc = {
  aggregates: [
    { id: "lead", name: "Lead", owner: "sales", attributes: [{ name: "email", type: "text" }, { name: "source", type: "text" }], references: [] },
    { id: "offer", name: "Offer", owner: "sales", attributes: [{ name: "amount", type: "money" }], references: ["lead"] },
  ],
  commands: [
    { id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", capability: "sales", emits: ["lead_qualified"] },
    { id: "draft_offer", name: "Draft Offer", aggregate: "offer", capability: "sales", emits: [] },
  ],
  events: [{ id: "lead_qualified", name: "Lead Qualified", aggregate: "lead", trigger: "command" }],
} as unknown as DomainDoc;
const agents: AgentsDoc = { agents: [{ id: "sales_agent", name: "Sales Agent", capabilities: ["sales"], goal: "Win deals" }] } as unknown as AgentsDoc;

test("mockExternalServices seeds a sync qualifier (has a qualify command) + an async reviewer (has a document entity)", () => {
  const doc = mockExternalServices(caps, domain, undefined, agents);
  const sync = doc.services.find((s) => s.invocation === "sync");
  const async = doc.services.find((s) => s.invocation === "async");
  assert.ok(sync && sync.entity === "lead" && sync.resultTarget?.kind === "command", "sync qualifier records via a command");
  assert.ok(async && async.entity === "offer" && async.resultTarget?.kind === "agent", "async reviewer wakes an agent on callback");
});

test("externalServicesAdapter: sync → one call workflow; async → a start + a callback (webhook) workflow", () => {
  const doc = mockExternalServices(caps, domain, undefined, agents);
  const { descriptors, n8n } = externalServicesAdapter(doc, domain);
  assert.ok(Object.keys(descriptors).some((p) => p.startsWith("services/") && p.endsWith(".json")));
  // sync: Call → vendor → record via command
  const sync = n8n.find((w) => w.name.startsWith("Service (sync)"))!;
  const syncTypes = sync.nodes.map((n) => n.type);
  assert.ok(syncTypes.includes("n8n-nodes-base.httpRequest"));
  assert.ok(sync.nodes.some((n) => (n.parameters as { url?: string }).url?.includes("/leads/{id}/qualify_lead")), "records the result via the spine command");
  // async: a start workflow AND a callback webhook workflow
  const start = n8n.find((w) => w.name.startsWith("Service (async start)"));
  const cb = n8n.find((w) => w.name.startsWith("Service (async callback)"))!;
  assert.ok(start, "async start workflow");
  assert.equal(cb.nodes[0].type, "n8n-nodes-base.webhook"); // the callback IS a trigger
  assert.match(String((cb.nodes[0].parameters as { path: string }).path), /^callback\//);
  // the callback wakes the agent (async reviewer resultTarget = agent)
  assert.ok(cb.nodes.some((n) => (n.parameters as { url?: string }).url?.includes("/run")));
});

test("mode=external process → a delegate connector (not the internal pipeline)", () => {
  const workflows = { version: "0.1", workflows: [{ id: "screen_lead", name: "Screen Lead", steps: ["qualify_lead"], mode: "external" as const, service: "svc_lead_qualifier" }] };
  const services = { version: "0.1", services: [{ id: "svc_lead_qualifier", name: "Lead Qualifier", kind: "agent" as const, invocation: "sync" as const, entity: "lead", endpoint: "https://api.q.example.com/score", requestMapping: {}, responseMapping: {} }] };
  const rep = projectTargets(DEFAULT_BINDING, caps, domain, undefined, undefined, workflows as never, undefined, {}, undefined, undefined, agents, undefined, services as never);
  const proc = rep.artifacts.n8n.find((w) => w.name.startsWith("Process (external)"));
  assert.ok(proc, "external-mode process emits a delegate connector");
  assert.ok(proc!.nodes.some((n) => (n.parameters as { url?: string }).url === "https://api.q.example.com/score"), "delegates to the bound service endpoint");
  // and it is NOT emitted as an internal command pipeline
  assert.ok(!rep.artifacts.n8n.some((w) => w.name === "Process: Screen Lead"));
});

test("per-step delegation: a bound step calls the vendor; the rest of the pipeline stays internal", () => {
  const workflows = { version: "0.1", workflows: [{ id: "l2s", name: "Lead to Sale", steps: ["capture_lead", "qualify_lead", "draft_offer"], mode: "workflow" as const, stepBindings: { qualify_lead: "svc_lead_qualifier" } }] };
  const services = { version: "0.1", services: [{ id: "svc_lead_qualifier", name: "Lead Qualifier", kind: "agent" as const, invocation: "sync" as const, entity: "lead", endpoint: "https://api.q.example.com/score", requestMapping: {}, responseMapping: {} }] };
  const rep = projectTargets(DEFAULT_BINDING, caps, domain, undefined, undefined, workflows as never, undefined, {}, undefined, undefined, agents, undefined, services as never);
  const proc = rep.artifacts.n8n.find((w) => w.name === "Process: Lead to Sale")!;
  const delegate = proc.nodes.find((n) => String(n.name).startsWith("Delegate:"));
  assert.ok(delegate, "the bound step is a delegate node");
  assert.equal((delegate!.parameters as { url: string }).url, "https://api.q.example.com/score");
  // the other two steps remain internal spine-command calls
  const internal = proc.nodes.filter((n) => (n.parameters as { url?: string }).url?.includes("spine.local"));
  assert.equal(internal.length, 2);
});

test("agents get external services they own as delegable tools (kind: external)", () => {
  const doc = mockExternalServices(caps, domain, undefined, agents);
  const files = agentsAdapter(caps, domain, agents, undefined, undefined, doc);
  const def = JSON.parse(files["agents/definitions/sales_agent.json"]);
  const ext = def.tools.find((t: { kind: string }) => t.kind === "external");
  assert.ok(ext, "the sales agent can delegate to an external service");
  assert.match(ext.invoke.url, /example\.com/);
  // the runtime knows how to invoke an external tool
  assert.match(files["agents/src/tools.ts"], /kind === "external"/);
});
