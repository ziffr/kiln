import { test } from "node:test";
import assert from "node:assert/strict";
import { projectTargets, assembleFullStack, DEFAULT_BINDING, type Binding } from "../src/index.ts";
import type { CapabilityDoc, DomainDoc, AgentsDoc } from "@kiln/compiler";

// A tiny model with one agent that owns the `leads` capability (→ the `lead` entity + its command).
const caps = { domain: "T", capabilities: [{ id: "leads", name: "Leads", purpose: "", outcomes: [] }] } as unknown as CapabilityDoc;
const domain = {
  aggregates: [{ id: "lead", name: "Lead", owner: "leads", attributes: [{ name: "email", type: "text" }], references: [] }],
  commands: [{ id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", emits: [] }],
  events: [],
} as unknown as DomainDoc;
const agents = { agents: [{ id: "sales_agent", name: "Sales Agent", goal: "Qualify leads", capabilities: ["leads"] }] } as unknown as AgentsDoc;

const withAgents = (binding: Binding) => projectTargets(binding, caps, domain, undefined, undefined, undefined, undefined, undefined, undefined, undefined, agents);

test("langdock engine emits an agent-provisioning bundle only when the binding selects it", () => {
  // default binding (agentRuntime unset) → the Node runtime, NO langdock output.
  const off = withAgents(DEFAULT_BINDING);
  assert.equal(off.artifacts.engines.langdock, undefined, "langdock not in play by default");

  // opt in via the app-level agent-runtime binding.
  const on = withAgents({ ...DEFAULT_BINDING, agentRuntime: "langdock" });
  const out = on.artifacts.engines.langdock;
  assert.ok(out, "langdock is in play when binding.agentRuntime = langdock");
  // one Agent Create spec per agent + the provision/invoke scripts + docs, all under the langdock/ prefix.
  assert.ok(out.files["langdock/agents/sales_agent.json"], "per-agent create spec");
  assert.ok(out.files["langdock/provision.mjs"].includes("/agent/v1/create"), "provisions via the Agent API");
  assert.ok(out.files["langdock/invoke.mjs"].includes("/agent/v1/chat/completions"), "invokes via the completions API");
  assert.ok(out.files["langdock/README.md"], "has a README");
  for (const rel of Object.keys(out.files)) assert.ok(rel.startsWith("langdock/"), `${rel} owns the langdock/ prefix`);

  // the spec grounds the agent: name, model, instructions (with its command API), knowledge (its entity).
  const spec = JSON.parse(out.files["langdock/agents/sales_agent.json"]);
  assert.equal(spec.name, "Sales Agent");
  assert.equal(spec.model, "claude-sonnet-5");
  assert.ok(spec.instructions.includes("qualify"), "instructions mention the command");
  assert.ok(spec.knowledge.includes("Lead"), "knowledge describes the owned entity");
  assert.deepEqual(spec.metadata.capabilities, ["leads"]);
});

test("langdock never fires without agents, even when selected", () => {
  const noAgents = projectTargets({ ...DEFAULT_BINDING, agentRuntime: "langdock" }, caps, domain);
  assert.equal(noAgents.artifacts.engines.langdock, undefined);
});

test("assembleFullStack writes the langdock/ bundle end-to-end (third-party engine channel)", () => {
  const { files } = assembleFullStack({
    binding: { ...DEFAULT_BINDING, agentRuntime: "langdock" },
    capabilities: caps, domain, agents, dialect: "postgres",
  } as never);
  assert.ok(files["langdock/agents/sales_agent.json"], "langdock spec written to the repo");
  assert.ok(files["langdock/provision.mjs"], "provision script written");
  // the Node agents runtime is still emitted alongside (Langdock is additive, not a replacement).
  assert.ok(Object.keys(files).some((f) => f.startsWith("agents/")), "Node agents runtime still present");
});

test("managed-agents engine emits an Agent-Create bundle with commands as custom tools", () => {
  const off = withAgents(DEFAULT_BINDING);
  assert.equal(off.artifacts.engines["managed-agents"], undefined, "not in play by default");

  const on = projectTargets({ ...DEFAULT_BINDING, agentRuntime: "managed-agents" }, caps, domain, undefined, undefined, undefined, undefined, undefined, undefined, undefined, agents);
  const out = on.artifacts.engines["managed-agents"];
  assert.ok(out, "in play when binding.agentRuntime = managed-agents");
  assert.ok(out.files["managed-agents/agents/sales_agent.agent.json"], "per-agent Agent-Create spec");
  assert.ok(out.files["managed-agents/provision.sh"].includes("ant beta:agents create"), "provisions via the ant CLI");
  assert.ok(out.files["managed-agents/run.mjs"].includes("sessions.create"), "runs via a Session");
  for (const rel of Object.keys(out.files)) assert.ok(rel.startsWith("managed-agents/"), `${rel} owns its prefix`);

  const spec = JSON.parse(out.files["managed-agents/agents/sales_agent.agent.json"]);
  assert.equal(spec.model, "claude-sonnet-5");
  assert.ok(spec.tools.some((t) => t.type === "agent_toolset_20260401"), "built-in toolset");
  const cmdTool = spec.tools.find((t) => t.type === "custom" && t.name === "qualify_lead");
  assert.ok(cmdTool, "the owned command is a custom tool");
  // commands.json maps each command tool to its spine endpoint (run.mjs executes host-side).
  const endpoints = JSON.parse(out.files["managed-agents/commands.json"]);
  assert.ok(endpoints.qualify_lead?.url?.includes("/leads/"), "command → spine endpoint");
})
