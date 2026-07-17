import { test } from "node:test";
import assert from "node:assert/strict";
import { agentsAdapter, resolveAgentDefs, tbdBehaviour, NO_BEHAVIOUR_MARKER, agentToolParams, buildToolSchemas, mockDispatch, runAgentLoop, toOpenAiMessages, toOpenAiTools, type LoopMessage, type LoopTurn, type ToolSchema } from "../src/index.ts";
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

// Kiln does not invent a behaviour. With none authored the export ships an obvious TBD carrying a
// machine-detectable marker — NOT a template restating the contract, which is what made an undesigned
// agent look designed (and made the prompt critique circular).
test("tbdBehaviour is an obvious NOT-YET-DESIGNED placeholder, not a contract copy", () => {
  const [def] = resolveAgentDefs(caps, domain, agents);
  const tbd = tbdBehaviour(def);
  assert.ok(tbd.startsWith(NO_BEHAVIOUR_MARKER), "carries the sentinel a runtime can detect");
  assert.match(tbd, /NOT YET DESIGNED/);
  assert.match(tbd, /Generate/, "says how to close the gap");
  assert.match(tbd, /definitions\/lead_agent\.json/, "POINTS AT the contract");
  // The whole point: it must not restate the contract (tools/commands/entities) as if it were a design.
  assert.ok(!tbd.includes("qualify_lead"), "does not copy the agent's tools/commands into the prompt");
  assert.ok(!tbd.includes("notify"), "does not copy the notify tool in");
});

test("export writes a TBD behaviour for an undesigned agent, and the runtime refuses it", () => {
  const undesigned = { agents: [{ ...(agents as unknown as { agents: Array<Record<string, unknown>> }).agents[0], instructions: undefined }] } as unknown as AgentsDoc;
  const files = agentsAdapter(caps, domain, undesigned);
  const behaviour = files["agents/behaviours/lead_agent.md"];
  assert.ok(behaviour.includes(NO_BEHAVIOUR_MARKER), "the exported behaviour carries the sentinel");
  assert.match(behaviour, /NOT YET DESIGNED/);
  assert.ok(!behaviour.includes("qualify_lead"), "no contract copy in the shipped file");
  // The generated runtime detects the sentinel and throws, naming the file + what to do.
  const run = files["agents/src/run.ts"];
  assert.ok(run.includes(NO_BEHAVIOUR_MARKER), "the runtime bakes in the literal marker (not a bare identifier)");
  assert.match(run, /system\.includes\(NO_BEHAVIOUR_MARKER\)/);
  assert.match(run, /throw new Error/);
  assert.match(run, /agents\/behaviours\//, "the error names the file to write");
});

test("an agent WITH an authored behaviour is untouched — it ships verbatim, no marker", () => {
  const files = agentsAdapter(caps, domain, agents);
  const behaviour = files["agents/behaviours/lead_agent.md"];
  assert.equal(behaviour, "Be precise.\n", "authored instructions ship byte-for-byte");
  assert.ok(!behaviour.includes(NO_BEHAVIOUR_MARKER));
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

test("toOpenAiTools maps provider-neutral schemas to OpenAI function tools", () => {
  const schemas: ToolSchema[] = [
    { name: "qualify_lead", description: "Qualify a lead", input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
    { name: "notify", description: "Notify a human", input_schema: { type: "object", properties: {} } },
  ];
  const tools = toOpenAiTools(schemas);
  assert.equal(tools.length, 2);
  assert.deepEqual(tools[0], { type: "function", function: { name: "qualify_lead", description: "Qualify a lead", parameters: schemas[0].input_schema } });
  assert.equal((tools[1].function as { name: string }).name, "notify");
});

test("toOpenAiMessages prepends system, passes user + assistant through, and expands tool_result → role:tool", () => {
  // The assistant message object the OAI nextTurn stores as `turn.content`.
  const assistantMsg = { role: "assistant", content: "", tool_calls: [{ id: "call_1", type: "function", function: { name: "qualify_lead", arguments: "{\"id\":\"L1\"}" } }] };
  const messages: LoopMessage[] = [
    { role: "user", content: "Qualify the newest lead" },
    { role: "assistant", content: assistantMsg },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: "{\"ok\":true}" }] },
  ];
  const out = toOpenAiMessages(messages, "You are a lead agent.");
  // system prepended
  assert.deepEqual(out[0], { role: "system", content: "You are a lead agent." });
  // user string
  assert.deepEqual(out[1], { role: "user", content: "Qualify the newest lead" });
  // assistant object passed through as-is (with its tool_calls)
  assert.equal(out[2], assistantMsg);
  // tool_result expanded to an OpenAI role:tool message keyed by tool_call_id
  assert.deepEqual(out[3], { role: "tool", tool_call_id: "call_1", content: "{\"ok\":true}" });
  assert.equal(out.length, 4);
});

test("toOpenAiMessages expands each tool_result in a multi-result user turn into its own role:tool message", () => {
  const messages: LoopMessage[] = [
    { role: "user", content: [
      { type: "tool_result", tool_use_id: "a", content: "1" },
      { type: "tool_result", tool_use_id: "b", content: "2" },
    ] },
  ];
  const out = toOpenAiMessages(messages, "sys");
  assert.equal(out.length, 3); // system + 2 tool messages
  assert.deepEqual(out[1], { role: "tool", tool_call_id: "a", content: "1" });
  assert.deepEqual(out[2], { role: "tool", tool_call_id: "b", content: "2" });
});

test("runAgentLoop honours the step cap even if the model keeps calling tools", async () => {
  const [def] = resolveAgentDefs(caps, domain, agents);
  const looping = async (_msgs: LoopMessage[]): Promise<LoopTurn> => ({ text: "", toolUses: [{ id: "x", name: "qualify_lead", input: {} }], end: false, usage: { input: 1, output: 1, cacheRead: 0, cacheCreate: 0 }, content: [] });
  const res = await runAgentLoop(def, "loop", looping, 3);
  assert.equal(res.stepCount, 3, "capped at maxSteps");
});

test("mockDispatch simulates read tools so they work in the in-Studio Test-agent loop", () => {
  const list: AgentTool = { name: "list_lead", kind: "read", description: "List Lead records", invoke: { method: "GET", url: "{{SPINE_URL}}/leads" } };
  const get: AgentTool = { name: "get_lead", kind: "read", description: "Fetch one Lead by id", invoke: { method: "GET", url: "{{SPINE_URL}}/leads/{id}" }, input: ["id"] };

  const listed = mockDispatch(list, {}) as { status: number; rows: Array<{ id: string }>; total: number; note: string };
  assert.equal(listed.status, 200);
  assert.ok(listed.rows.length > 0 && listed.total === listed.rows.length);
  assert.match(listed.note, /Simulated list_lead/);
  assert.match(listed.note, /no spine call was made/); // honest: it's a simulation, not real data

  const one = mockDispatch(get, { id: "lead-42" }) as { status: number; record: { id: string }; note: string };
  assert.equal(one.record.id, "lead-42"); // echoes the requested id
  assert.match(one.note, /no spine call was made/);
  // a get with no id still returns a plausible record so the loop can proceed
  assert.equal((mockDispatch(get, {}) as { record: { id: string } }).record.id, "lead-0001");
});

test("mockDispatch simulates find_* — a plausible match, and a plausible NOT-FOUND", () => {
  const find: AgentTool = { name: "find_lead", kind: "read", description: "Find Lead records by field", invoke: { method: "GET", url: "{{SPINE_URL}}/leads" }, input: ["email", "status"] };
  type FindOut = { status: number; query: Record<string, string>; rows: Array<Record<string, string>>; total: number; note: string; error?: string };

  // Deterministic on the query itself → a trace is reproducible; the same lookup never flips.
  const twice = [1, 2].map(() => JSON.stringify(mockDispatch(find, { email: "ada@example.com" })));
  assert.equal(twice[0], twice[1], "the same filter always simulates the same way");

  // Both branches are reachable — "no match" is the interesting answer for a dedup check, so a mock that
  // always found a record would mislead the agent half the time.
  const outcomes = ["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com", "f@x.com"].map((email) => (mockDispatch(find, { email }) as FindOut).rows.length > 0);
  assert.ok(outcomes.includes(true), "some lookups simulate a match");
  assert.ok(outcomes.includes(false), "some lookups simulate NOT FOUND (the dedup branch)");

  // A match echoes the filter back and carries the same shape as the real runtime's response.
  const hit = ["a@x.com", "b@x.com", "c@x.com", "d@x.com"].map((email) => mockDispatch(find, { email }) as FindOut).find((o) => o.rows.length > 0)!;
  assert.equal(hit.status, 200);
  assert.equal(hit.total, hit.rows.length); // the capReadRows contract, same as list_*
  assert.equal(hit.rows[0].email, hit.query.email, "the matched record carries the field it matched on");
  assert.ok(hit.rows[0].id, "a matched record has an id the agent can act on");
  assert.match(hit.note, /Simulated find_lead/);
  assert.match(hit.note, /no spine call was made/); // honest: simulated, never real data

  // Only the fields actually passed become the query; empty/absent ones are dropped, not sent as "".
  const partial = mockDispatch(find, { email: "ada@example.com", status: "" }) as FindOut;
  assert.deepEqual(Object.keys(partial.query), ["email"]);

  // No filter at all → the same 400 the spine's route would give, not a silent full-table dump.
  const none = mockDispatch(find, {}) as FindOut;
  assert.equal(none.status, 400);
  assert.match(none.error!, /pass at least one of: email, status/);
});
