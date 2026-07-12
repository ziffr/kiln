import { test } from "node:test";
import assert from "node:assert/strict";
import { mockTriggers, triggersAdapter } from "../src/triggers.ts";
import { projectTargets, DEFAULT_BINDING } from "../src/index.ts";
import type { CapabilityDoc, DomainDoc, AgentsDoc } from "@vbd/compiler";

const caps: CapabilityDoc = { domain: "Solar", capabilities: [{ id: "leads", name: "Lead Management", purpose: "", outcomes: [] }] } as unknown as CapabilityDoc;
const domain: DomainDoc = {
  aggregates: [{ id: "lead", name: "Lead", owner: "leads", attributes: [{ name: "email", type: "text" }], references: [] }],
  commands: [{ id: "capture_lead", name: "Capture Lead", aggregate: "lead", emits: ["lead_captured"] }],
  events: [
    { id: "lead_captured", name: "Lead Captured", aggregate: "lead", trigger: "command" },
    { id: "webform_submitted", name: "Web Form Submitted", aggregate: "lead", trigger: "external" },
    { id: "daily_review_due", name: "Daily Review Due", aggregate: "lead", trigger: "time" },
  ],
} as unknown as DomainDoc;
const agents: AgentsDoc = { agents: [{ id: "lead_agent", name: "Lead Agent", capabilities: ["leads"], goal: "Qualify leads" }] } as unknown as AgentsDoc;

test("mockTriggers grounds triggers in external/time events + wakes an agent", () => {
  const doc = mockTriggers(caps, domain, undefined, agents);
  const byId = new Map(doc.triggers.map((t) => [t.id, t]));
  // external event → inbound webhook; time event → schedule
  const hook = byId.get("hook_webform_submitted");
  assert.ok(hook && hook.source === "webhook" && hook.path === "hook/webform_submitted");
  const cron = byId.get("cron_daily_review_due");
  assert.ok(cron && cron.source === "schedule" && cron.cron);
  // command-triggered event does NOT spawn a trigger (only external/time do)
  assert.ok(!doc.triggers.some((t) => t.id.includes("lead_captured")));
  // routes to the agent (the judgment surface)
  assert.ok(doc.triggers.every((t) => t.target.kind === "agent" && t.target.ref === "lead_agent"));
});

test("no agents → external/time triggers route to notify", () => {
  const doc = mockTriggers(caps, domain);
  assert.ok(doc.triggers.length >= 2);
  assert.ok(doc.triggers.every((t) => t.target.kind === "notify"));
});

test("triggersAdapter emits an importable n8n workflow per trigger (source → action)", () => {
  const doc = mockTriggers(caps, domain, undefined, agents);
  const wfs = triggersAdapter(doc, domain);
  assert.equal(wfs.length, doc.triggers.length);
  for (const w of wfs) {
    assert.ok(w.id.startsWith("vbd_trigger_"), "stable id (n8n NOT NULL)");
    assert.equal(w.nodes.length, 2, "source + action");
    assert.ok(w.settings && w.active === false);
    // the connection references the action node by name
    assert.equal(Object.keys(w.connections).length, 1);
  }
  // a webhook source and a schedule source both appear
  const types = wfs.flatMap((w) => w.nodes.map((n) => n.type));
  assert.ok(types.includes("n8n-nodes-base.webhook"));
  assert.ok(types.includes("n8n-nodes-base.scheduleTrigger"));
  // agent target → an HTTP call to the agent runtime's /run
  const agentCall = wfs.flatMap((w) => w.nodes).find((n) => (n.parameters as { url?: string })?.url?.includes("/run"));
  assert.ok(agentCall, "agent target POSTs /run");
});

test("command / workflow / notify targets each map to the right node type", () => {
  const doc = {
    triggers: [
      { id: "t_cmd", name: "cmd", source: "webhook" as const, path: "hook/x", target: { kind: "command" as const, ref: "capture_lead" } },
      { id: "t_wf", name: "wf", source: "webhook" as const, path: "hook/y", target: { kind: "workflow" as const, ref: "onboard" } },
      { id: "t_notify", name: "note", source: "schedule" as const, cron: "0 9 * * *", target: { kind: "notify" as const, ref: "ops@x.com" } },
    ],
  };
  const wfs = triggersAdapter(doc, domain);
  const action = (id: string) => wfs.find((w) => w.id === `vbd_trigger_${id}`)!.nodes[1];
  assert.equal(action("t_cmd").type, "n8n-nodes-base.httpRequest");
  assert.match(String((action("t_cmd").parameters as { url: string }).url), /\/leads/); // create endpoint
  assert.equal(action("t_wf").type, "n8n-nodes-base.executeWorkflow");
  assert.match(String((action("t_wf").parameters as { workflowId: string }).workflowId), /vbd_process_onboard/);
  assert.equal(action("t_notify").type, "n8n-nodes-base.set");
});

test("projectTargets includes the triggers artifact (mock by default)", () => {
  const report = projectTargets(DEFAULT_BINDING, caps, domain, undefined, undefined, undefined, undefined, {}, undefined, undefined, agents);
  assert.ok(report.artifacts.triggers, "triggers artifact present");
  assert.ok(report.artifacts.triggers.n8n.length >= 1);
  assert.equal(report.artifacts.triggers.doc.triggers.length, report.artifacts.triggers.n8n.length);
});
