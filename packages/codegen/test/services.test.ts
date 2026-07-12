import { test } from "node:test";
import assert from "node:assert/strict";
import { mockExternalServices, externalServicesAdapter, agentsAdapter } from "../src/index.ts";
import type { CapabilityDoc, DomainDoc, AgentsDoc } from "@vbd/compiler";

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
