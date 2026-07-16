import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAgentDefs, defaultPlaybook, agentToolParams, buildToolSchemas, mockDispatch, runAgentLoop, type LoopMessage, type LoopTurn } from "../src/index.ts";
import type { CapabilityDoc, DomainDoc, AgentsDoc } from "@kiln/compiler";
import type { AgentTool } from "../src/agents.ts";

const caps: CapabilityDoc = { domain: "Solar", capabilities: [{ id: "leads", name: "Lead Management", purpose: "", outcomes: [] }] } as unknown as CapabilityDoc;
const domain: DomainDoc = {
  aggregates: [{ id: "lead", name: "Lead", owner: "leads", attributes: [{ name: "email", type: "text" }], references: [] }],
  commands: [{ id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", capability: "leads", emits: ["lead_qualified"] }],
  events: [{ id: "lead_qualified", name: "Lead Qualified", aggregate: "lead", trigger: "command" }],
} as unknown as DomainDoc;
const agents: AgentsDoc = { agents: [{ id: "lead_agent", name: "Lead Agent", capabilities: ["leads"], goal: "Qualify inbound leads", instructions: "Be precise." }] } as unknown as AgentsDoc;

test("resolveAgentDefs resolves each agent's tools (command + notify), reusing the exported seam", () => {
  const defs = resolveAgentDefs(caps, domain, agents);
  assert.equal(defs.length, 1);
  const def = defs[0];
  assert.equal(def.id, "lead_agent");
  const names = def.tools.map((t) => t.name);
  assert.ok(names.includes("qualify_lead"), "owned command becomes a tool");
  assert.ok(names.includes("notify"), "every agent gets the notify router");
  // capabilities are mapped to display names (matches the runtime)
  assert.deepEqual(def.capabilities, ["Lead Management"]);
});

test("defaultPlaybook is a non-empty markdown fallback naming the agent + its commands", () => {
  const [def] = resolveAgentDefs(caps, domain, agents);
  const pb = defaultPlaybook(def);
  assert.match(pb, /Lead Agent — behaviour/);
  assert.match(pb, /qualify_lead/);
});

test("agentToolParams / buildToolSchemas produce per-kind argument schemas", () => {
  const cmd: AgentTool = { name: "qualify_lead", kind: "command", description: "", invoke: {}, input: ["email"] };
  const p = agentToolParams(cmd) as { properties: Record<string, unknown> };
  assert.ok("id" in p.properties && "email" in p.properties, "command params include id + typed fields");
  const notify: AgentTool = { name: "notify", kind: "notify", description: "", invoke: {} };
  const np = agentToolParams(notify) as { required: string[] };
  assert.deepEqual(np.required, ["recipient", "body"]);
  const [def] = resolveAgentDefs(caps, domain, agents);
  assert.equal(buildToolSchemas(def).length, def.tools.length);
});

test("mockDispatch simulates every tool kind WITHOUT a network call", () => {
  const kinds: AgentTool["kind"][] = ["command", "notify", "email", "slack", "external", "pdf"];
  for (const kind of kinds) {
    const out = mockDispatch({ name: `t_${kind}`, kind, description: "", invoke: { invocation: "sync", service: "svc" } }, { id: "L1", email: "a@b.c", recipient: "boss" }) as Record<string, unknown>;
    assert.equal(typeof out, "object");
    assert.match(String(out.note ?? ""), /[Ss]imulated/, `${kind} result reads as simulated`);
  }
  const cmd = mockDispatch({ name: "qualify_lead", kind: "command", description: "", invoke: {} }, { id: "L1", score: "9" }) as { id: string; applied: Record<string, unknown> };
  assert.equal(cmd.id, "L1");
  assert.deepEqual(cmd.applied, { score: "9" }, "command echoes applied fields minus id");
});

test("runAgentLoop runs a bounded, mock-dispatched trace: tool call then final text", async () => {
  const [def] = resolveAgentDefs(caps, domain, agents);
  const turns: LoopTurn[] = [
    { text: "Let me qualify the lead.", toolUses: [{ id: "tu1", name: "qualify_lead", input: { id: "L1" } }], end: false, usage: { input: 100, output: 20, cacheRead: 0, cacheCreate: 0 }, content: [] },
    { text: "Done — lead L1 qualified.", toolUses: [], end: true, usage: { input: 130, output: 15, cacheRead: 0, cacheCreate: 0 }, content: [] },
  ];
  let i = 0;
  const nextTurn = async (_msgs: LoopMessage[]) => turns[i++];
  const res = await runAgentLoop(def, "Qualify the newest lead", nextTurn);
  assert.equal(res.finalText, "Done — lead L1 qualified.");
  assert.equal(res.stepCount, 2, "two model turns");
  assert.equal(res.usage.input, 230);
  assert.equal(res.usage.output, 35);
  // steps: assistant text, tool call (simulated), assistant text
  const toolStep = res.steps.find((s) => s.toolCall);
  assert.ok(toolStep, "a tool step exists");
  assert.equal(toolStep!.simulated, true, "tool step is flagged simulated");
  assert.equal(toolStep!.toolCall!.name, "qualify_lead");
  assert.ok(res.steps.some((s) => s.assistantText === "Done — lead L1 qualified."));
});

test("runAgentLoop honours the step cap even if the model keeps calling tools", async () => {
  const [def] = resolveAgentDefs(caps, domain, agents);
  const looping = async (_msgs: LoopMessage[]): Promise<LoopTurn> => ({ text: "", toolUses: [{ id: "x", name: "qualify_lead", input: {} }], end: false, usage: { input: 1, output: 1, cacheRead: 0, cacheCreate: 0 }, content: [] });
  const res = await runAgentLoop(def, "loop", looping, 3);
  assert.equal(res.stepCount, 3, "capped at maxSteps");
});
