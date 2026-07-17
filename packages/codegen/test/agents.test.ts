import { test } from "node:test";
import assert from "node:assert/strict";
import { agentsAdapter, resolveAgentDefs, agentContract, agentToolParams, capReadRows, filterableFields, READ_ROW_CAP } from "../src/index.ts";
import type { CapabilityDoc, DomainDoc, AgentsDoc } from "@kiln/compiler";
import type { CommunicationsDoc } from "../src/comms.ts";

const caps: CapabilityDoc = { domain: "Solar", capabilities: [{ id: "leads", name: "Lead Management", purpose: "", outcomes: [] }] } as unknown as CapabilityDoc;
const domain: DomainDoc = {
  aggregates: [{ id: "lead", name: "Lead", owner: "leads", attributes: [{ name: "email", type: "text" }], references: [] }],
  commands: [
    { id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", emits: ["lead_qualified"] },
    { id: "capture_lead", name: "Capture Lead", aggregate: "lead", emits: ["lead_captured"] },
  ],
  events: [{ id: "lead_qualified", name: "Lead Qualified", aggregate: "lead", trigger: "command" }],
} as unknown as DomainDoc;
const agents: AgentsDoc = { agents: [{ id: "lead_agent", name: "Lead Agent", capabilities: ["leads"], goal: "Qualify inbound leads" }] } as unknown as AgentsDoc;
const comms: CommunicationsDoc = { actions: [{ id: "slack_lead_qualified", name: "Slack on qualified", channel: "slack", on: "lead_qualified", entity: "lead", recipient: "#sales", subject: "", template: "" }] };

test("agentsAdapter emits a runnable runtime + a definition per agent with wired tools", () => {
  const files = agentsAdapter(caps, domain, agents, comms);
  // the runtime — provider-flexible (Anthropic native + one OpenAI-compatible path for every gateway)
  for (const p of ["agents/package.json", "agents/src/runner.ts", "agents/src/run.ts", "agents/src/server.ts", "agents/src/tools.ts", "agents/src/def.ts", "agents/src/providers/anthropic.ts", "agents/src/providers/openaiCompatible.ts", "agents/.env.example", "agents/tsconfig.json", "agents/README.md"]) assert.ok(files[p], `${p} missing`);
  assert.match(files["agents/package.json"], /@anthropic-ai\/sdk/);
  assert.match(files["agents/package.json"], /"openai"/);
  // HTTP mode — a webhook/trigger can WAKE an agent via POST /run
  assert.match(files["agents/package.json"], /"express"/);
  assert.match(files["agents/package.json"], /"serve":/);
  assert.match(files["agents/src/server.ts"], /\/run/);
  assert.match(files["agents/src/server.ts"], /runAgent/);
  assert.match(files["agents/src/run.ts"], /export async function runAgent/);
  assert.match(files["agents/src/runner.ts"], /runAgent/); // CLI reuses the shared helper
  assert.match(files["agents/src/providers/anthropic.ts"], /client\.messages\.create/);
  assert.match(files["agents/src/providers/openaiCompatible.ts"], /chat\.completions\.create/);
  // the one OpenAI-compatible path resolves every gateway the Studio offers
  assert.match(files["agents/src/providers/openaiCompatible.ts"], /openrouter/);
  assert.match(files["agents/src/providers/openaiCompatible.ts"], /omniroute/);
  assert.match(files["agents/src/run.ts"], /openrouter|anthropic/);
  assert.match(files["agents/src/run.ts"], /runOpenAICompatible/);
  // default .env leads with Anthropic when no engine is baked
  assert.match(files["agents/.env.example"], /PROVIDER=anthropic/);
  // the behaviour (the "HOW") — a markdown file the runtime loads as the system prompt. This fixture's
  // agent has no authored behaviour, so what ships is the TBD, never a generated stand-in.
  assert.ok(files["agents/behaviours/lead_agent.md"], "behaviour file");
  assert.match(files["agents/behaviours/lead_agent.md"], /NOT YET DESIGNED/);
  assert.match(files["agents/src/run.ts"], /behaviours/); // runtime loads it
  // the definition
  assert.ok(files["agents/definitions/lead_agent.json"]);
  const def = JSON.parse(files["agents/definitions/lead_agent.json"]);
  assert.equal(def.goal, "Qualify inbound leads");
  const toolNames = def.tools.map((t: { name: string }) => t.name);
  // its capability's commands are tools
  assert.ok(toolNames.includes("qualify_lead") && toolNames.includes("capture_lead"));
  // a command tool points at the spine endpoint
  const qualify = def.tools.find((t: { name: string }) => t.name === "qualify_lead");
  assert.equal(qualify.kind, "command");
  assert.match(qualify.invoke.url, /\{\{SPINE_URL\}\}\/leads\/\{id\}\/qualify_lead/);
  // the human-in-the-loop notify tool (qualify itself OR email a human)
  assert.ok(def.tools.some((t: { kind: string }) => t.kind === "notify"));
  // the relevant pre-built comm is a tool
  assert.ok(def.tools.some((t: { name: string }) => t.name === "slack_lead_qualified"));
});

test("no agents → nothing emitted", () => {
  assert.equal(Object.keys(agentsAdapter(caps, domain, { agents: [] } as unknown as AgentsDoc)).length, 0);
});

test("baked engine default: an app built on a gateway leads its .env with that provider + model", () => {
  const files = agentsAdapter(caps, domain, agents, comms, undefined, undefined, { provider: "omniroute", model: "auto/coding", baseUrl: "https://gw.internal/v1" });
  const env = files["agents/.env.example"];
  assert.match(env, /PROVIDER=omniroute/); // leads with the built-on engine
  assert.match(env, /OMNIROUTE_MODEL=auto\/coding/); // the chosen model is baked
  assert.match(env, /OMNIROUTE_BASE_URL=https:\/\/gw\.internal\/v1/);
  assert.match(env, /built on "omniroute"/); // explains why + that Anthropic stays available
  assert.match(env, /ANTHROPIC_API_KEY/); // still present, just not the default
});

test("agent-mode processes fold into the covering agent's behaviour (SPEC-009)", () => {
  const domainWithCap = {
    ...domain,
    commands: [
      { id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", capability: "leads", emits: ["lead_qualified"] },
      { id: "capture_lead", name: "Capture Lead", aggregate: "lead", capability: "leads", emits: ["lead_captured"] },
    ],
  } as unknown as import("@kiln/compiler").DomainDoc;
  const workflows = {
    version: "0.1",
    workflows: [
      { id: "triage_lead", name: "Triage Lead", steps: ["capture_lead", "qualify_lead"], mode: "agent" },
      { id: "fixed_flow", name: "Fixed Flow", steps: ["capture_lead"], mode: "workflow" },
    ],
  } as unknown as import("@kiln/compiler").WorkflowsDoc;
  const files = agentsAdapter(caps, domainWithCap, agents, comms, workflows);
  const behaviour = files["agents/behaviours/lead_agent.md"];
  assert.match(behaviour, /## Processes you own/);
  assert.match(behaviour, /Triage Lead/);
  assert.doesNotMatch(behaviour, /Fixed Flow/); // workflow-mode does NOT fold into the agent
  // the routed process is also recorded on the definition (structure)
  const def = JSON.parse(files["agents/definitions/lead_agent.json"]);
  assert.ok(def.processes.some((p: { id: string }) => p.id === "triage_lead"));
});

// ── read tools: the agent's DATA path (the spine's existing GET routes) ──

test("agents get read tools (list + get) pointing at the spine's read routes", () => {
  const defs = resolveAgentDefs(caps, domain, agents, comms);
  const tools = defs[0].tools;
  const list = tools.find((t) => t.name === "list_lead");
  const get = tools.find((t) => t.name === "get_lead");
  assert.ok(list && get, "read tools resolved for the owned entity");
  assert.equal(list!.kind, "read");
  assert.equal(get!.kind, "read");
  // URLs match the spine's routes exactly: `${slug(aggregate)}s` list + /:id by id (see spine.ts routesFor)
  assert.deepEqual(list!.invoke, { method: "GET", url: "{{SPINE_URL}}/leads" });
  assert.deepEqual(get!.invoke, { method: "GET", url: "{{SPINE_URL}}/leads/{id}" });
  assert.deepEqual(get!.input, ["id"]);
  assert.equal(list!.input, undefined);
  // params: get_* requires an id; list_* takes none
  assert.deepEqual(agentToolParams(get!), { type: "object", properties: { id: { type: "string" } }, required: ["id"] });
  assert.deepEqual(agentToolParams(list!), { type: "object", properties: {} });
});

test("read access is capability-SCOPED — an agent gets no read tool for an entity it doesn't own", () => {
  const twoEntities = {
    ...domain,
    aggregates: [
      { id: "lead", name: "Lead", owner: "leads", attributes: [], references: [] },
      { id: "invoice", name: "Invoice", owner: "billing", attributes: [], references: [] },
    ],
  } as unknown as DomainDoc;
  const capsTwo = { ...caps, capabilities: [...caps.capabilities, { id: "billing", name: "Billing", purpose: "", outcomes: [] }] } as unknown as CapabilityDoc;
  const tools = resolveAgentDefs(capsTwo, twoEntities, agents, comms)[0].tools.map((t) => t.name);
  assert.ok(tools.includes("list_lead") && tools.includes("get_lead"), "owned entity is readable");
  // `leads` is the agent's only capability → the billing-owned Invoice stays out of reach.
  assert.ok(!tools.includes("list_invoice") && !tools.includes("get_invoice"), "unowned entity is NOT readable");
});

test("a command named like a read tool wins the collision; the read tool takes a stable suffixed name", () => {
  const clashing = {
    ...domain,
    commands: [...(domain.commands ?? []), { id: "list_lead", name: "List Lead", aggregate: "lead", emits: [] }],
  } as unknown as DomainDoc;
  const tools = resolveAgentDefs(caps, clashing, agents, comms)[0].tools;
  const cmd = tools.find((t) => t.name === "list_lead");
  assert.equal(cmd!.kind, "command", "the authored command keeps the name");
  const read = tools.find((t) => t.kind === "read" && t.name.startsWith("list_"));
  assert.equal(read!.name, "list_lead_records"); // deterministic de-dup
  assert.equal(tools.filter((t) => t.name === "list_lead").length, 1, "no duplicate names");
});

test("capReadRows caps an unbounded list HONESTLY (real total + truncated flag, never silent)", () => {
  const small = capReadRows([{ id: "a" }, { id: "b" }]);
  assert.deepEqual(small, { rows: [{ id: "a" }, { id: "b" }], total: 2 });
  assert.equal(small.truncated, undefined);
  // the spine's GET /<entity>s returns EVERY row — a big table must not blow the agent's context
  const big = capReadRows(Array.from({ length: 500 }, (_, i) => ({ id: `lead-${i}` })));
  assert.equal(big.rows.length, READ_ROW_CAP);
  assert.equal(big.total, 500, "the TRUE total is reported, not the capped count");
  assert.equal(big.truncated, true);
  assert.match(big.note!, /first 50 of 500/);
});

test("the emitted runtime executes read tools: GET + bearer + the same row cap", () => {
  const tools = agentsAdapter(caps, domain, agents, comms)["agents/src/tools.ts"];
  assert.match(tools, /tool\.kind === "read"/);
  assert.match(tools, /method: "GET"/);
  assert.match(tools, /headers\.authorization = "Bearer " \+ API_TOKEN/); // same opt-in bearer as writes
  assert.match(tools, /READ_ROW_CAP = 50/);
  assert.match(tools, /truncated: true/);
  // the emitted def.ts type must know the kind, or the runtime wouldn't typecheck
  assert.match(agentsAdapter(caps, domain, agents, comms)["agents/src/def.ts"], /"read"/);
});

test("the agent contract's tools facet includes the read tools", () => {
  const def = resolveAgentDefs(caps, domain, agents, comms)[0];
  const names = agentContract(def, domain).tools.map((t) => t.name);
  assert.ok(names.includes("list_lead") && names.includes("get_lead"));
});

// ── find_<entity>: look a record up BY FIELD instead of listing the table and scanning it ──

const typed: DomainDoc = {
  ...domain,
  aggregates: [{ id: "lead", name: "Lead", owner: "leads", attributes: [{ name: "email", type: "text" }, { name: "Status", type: "text" }, { name: "score", type: "number" }], references: ["invoice"] }],
} as unknown as DomainDoc;

test("filterableFields = the entity's TYPED attributes (slugged, deduped); never id", () => {
  assert.deepEqual(filterableFields(typed.aggregates[0]), ["email", "status", "score"]); // "Status" → slug
  // `id` is get_<entity>'s job — and `input: ["id"]` is the by-id schema's discriminator, so it must not leak in
  assert.deepEqual(filterableFields({ attributes: [{ name: "id", type: "text" }, { name: "email", type: "text" }] }), ["email"]);
  assert.deepEqual(filterableFields({ attributes: [] }), []);
  // legacy untyped `string[]` attributes still work (attributeSpecs coerces them)
  assert.deepEqual(filterableFields({ attributes: ["Email Address", "Email Address"] }), ["email_address"]);
});

test("agents get a find_<entity> tool exposing the entity's filterable fields by NAME", () => {
  const tool = resolveAgentDefs(caps, typed, agents, comms)[0].tools.find((t) => t.name === "find_lead");
  assert.ok(tool, "find tool resolved for the owned entity");
  assert.equal(tool!.kind, "read");
  // Same resource as list_* — the filter rides in the query string the runtime builds (see tools.ts).
  assert.deepEqual(tool!.invoke, { method: "GET", url: "{{SPINE_URL}}/leads" });
  assert.deepEqual(tool!.input, ["email", "status", "score"]);
  // The POINT: the model sees the fields it can filter on, not a free-text query string.
  assert.deepEqual(agentToolParams(tool!), {
    type: "object",
    properties: { email: { type: "string" }, status: { type: "string" }, score: { type: "string" } },
  });
  assert.match(tool!.description, /Exact match on email, status, score/);
  assert.match(tool!.description, /at most 50 matches/); // the same cap the runtime + spine enforce
});

test("an entity with no attributes gets no find tool (there'd be nothing to filter by)", () => {
  const bare = { ...domain, aggregates: [{ id: "lead", name: "Lead", owner: "leads", attributes: [], references: [] }] } as unknown as DomainDoc;
  const tools = resolveAgentDefs(caps, bare, agents, comms)[0].tools.map((t) => t.name);
  assert.ok(tools.includes("list_lead") && tools.includes("get_lead"));
  assert.ok(!tools.some((n) => n.startsWith("find_")), "no filterable fields → no find tool");
});

test("find access stays capability-SCOPED — no find tool for an entity the agent doesn't own", () => {
  const twoEntities = {
    ...domain,
    aggregates: [
      { id: "lead", name: "Lead", owner: "leads", attributes: [{ name: "email", type: "text" }], references: [] },
      { id: "invoice", name: "Invoice", owner: "billing", attributes: [{ name: "amount", type: "money" }], references: [] },
    ],
  } as unknown as DomainDoc;
  const capsTwo = { ...caps, capabilities: [...caps.capabilities, { id: "billing", name: "Billing", purpose: "", outcomes: [] }] } as unknown as CapabilityDoc;
  const tools = resolveAgentDefs(capsTwo, twoEntities, agents, comms)[0].tools.map((t) => t.name);
  assert.ok(tools.includes("find_lead"), "owned entity is queryable");
  assert.ok(!tools.includes("find_invoice"), "querying is NOT a way around the capability scope");
});

test("a command named like the find tool wins the collision; find takes a stable suffixed name", () => {
  const clashing = { ...typed, commands: [...(typed.commands ?? []), { id: "find_lead", name: "Find Lead", aggregate: "lead", emits: [] }] } as unknown as DomainDoc;
  const tools = resolveAgentDefs(caps, clashing, agents, comms)[0].tools;
  assert.equal(tools.find((t) => t.name === "find_lead")!.kind, "command", "the authored command keeps the name");
  assert.equal(tools.find((t) => t.kind === "read" && t.name.startsWith("find_"))!.name, "find_lead_records");
  assert.equal(tools.filter((t) => t.name === "find_lead").length, 1, "no duplicate names");
});

test("the emitted runtime turns a find tool's input into an exact-match query string (URL-encoded)", () => {
  const tools = agentsAdapter(caps, typed, agents, comms)["agents/src/tools.ts"];
  assert.match(tools, /new URLSearchParams\(\)/); // URLSearchParams encodes values (a@b.com → a%40b.com)
  assert.match(tools, /for \(const field of tool\.input \?\? \[\]\)/);
  assert.match(tools, /if \(!template\.includes\("\{id\}"\)\)/); // by-id reads keep the path substitution
  assert.match(tools, /url \+= "\?" \+ params\.toString\(\)/);
});

test("the agent contract's tools facet picks find_* up with its filterable params", () => {
  const def = resolveAgentDefs(caps, typed, agents, comms)[0];
  const find = agentContract(def, typed).tools.find((t) => t.name === "find_lead");
  assert.ok(find, "contract renders the find tool");
  assert.deepEqual(Object.keys((find!.input_schema as { properties: Record<string, unknown> }).properties), ["email", "status", "score"]);
});
