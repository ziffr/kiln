/**
 * @kiln/codegen/agents — wire agents to concrete TOOLS and emit a RUNNABLE, provider-flexible runtime.
 *
 * An agent (SPEC-008) is a goal + the capabilities it operates. This resolves, per agent, the tools it
 * can use — commands (the spine endpoints), a `notify` tool (human-in-the-loop router), the pre-built
 * comm actions — and emits a small TypeScript runtime that runs the agent loop over them. Two providers:
 * **Anthropic native** (default, best Claude fidelity) and **OpenRouter** (any model: Claude/GPT/Gemini/
 * Llama/self-hosted — one OpenAI-compatible integration). Commands are the universal action surface —
 * the UI clicks them, workflows sequence them, agents choose them. Pure and isomorphic.
 */

import { slug } from "@kiln/ir";
import { attributeSpecs, type AttributeSpec, type AggregateInput, type CapabilityDoc, type DomainDoc, type AgentsDoc, type WorkflowsDoc, type ToolsDoc, type IOSpec, type IOType, type ToolOperationKind } from "@kiln/compiler";
import type { CommunicationsDoc } from "./comms.ts";
import type { ExternalServicesDoc } from "./services.ts";
import { buildToolSchemas, type ToolSchema } from "./agentSim.ts";
import { mockTriggers, type TriggerInput, type TriggersDoc } from "./triggers.ts";
import { getConnectorAdapter } from "./connectors/index.ts";

const CREATE_VERB = /^(create|add|register|open|new|capture|issue|request|submit|plan|record)_/;

/**
 * The machine-detectable marker that an agent's `behaviours/<id>.md` is a NOT-YET-DESIGNED placeholder
 * rather than a real, authored behaviour. Kiln does not invent a behaviour: the contract says WHAT an
 * agent may do, a behaviour says HOW it decides, and a deterministic template can only restate the
 * contract — adding nothing while hiding that nobody designed the agent. So the export ships an obvious
 * TBD carrying this marker and the runtime REFUSES to run it (an undesigned agent still holds command
 * authority over the business database). It's a marker, not prose-sniffing: the moment a human writes a
 * real behaviour the marker is gone and the agent just runs.
 */
export const NO_BEHAVIOUR_MARKER = "<!-- KILN:NO_BEHAVIOUR -->";

export type AgentToolKind = "command" | "read" | "notify" | "email" | "slack" | "pdf" | "external" | "connector";

/**
 * How many rows a `read` LIST tool hands back to the model. The spine's `GET /<entity>s` returns EVERY
 * row (it has no pagination), so an unbounded list would blow the agent's context on a real table. The
 * runtime (and the mock dispatcher, for consistency) caps the rows and SAYS so — `capReadRows` never
 * truncates silently: it reports the true `total` and sets `truncated`.
 */
export const READ_ROW_CAP = 50;

/** Cap a read LIST result. Honest by construction: `total` is the real count; `truncated` says it was cut. */
export function capReadRows(rows: unknown[], cap = READ_ROW_CAP): { rows: unknown[]; total: number; truncated?: boolean; note?: string } {
  if (rows.length <= cap) return { rows, total: rows.length };
  return {
    rows: rows.slice(0, cap),
    total: rows.length,
    truncated: true,
    note: `Showing the first ${cap} of ${rows.length} records — narrow the question, or fetch a specific record by id.`,
  };
}

export interface AgentTool {
  name: string;
  kind: AgentToolKind;
  description: string;
  invoke: Record<string, unknown>;
  input?: string[];
  /**
   * SPEC-013 — a connector op's typed I/O + the op's semantic kind. Present only on `kind:"connector"`
   * tools. `io.input` drives the JSON-Schema the model sees; `io.output` is consumed for a response shape
   * (`connectorResponseSchema`); `io.kind` (read/list/write/send/delete) is carried through as the signal
   * for the Phase-B invocation gate — not wired to a runtime gate in Phase A.
   */
  io?: { input: IOSpec[]; output: IOSpec[]; kind: ToolOperationKind };
}

/**
 * SPEC-013 §4.6 — map one `IOType` onto a JSON-Schema type fragment. Scalars mirror the entity attribute
 * mapping; the extended kinds (`array`/`object`/`json`) express provider passthrough. Pure + isomorphic.
 */
const IO_JSON_TYPE: Record<IOType, Record<string, unknown>> = {
  text: { type: "string" },
  number: { type: "number" },
  boolean: { type: "boolean" },
  date: { type: "string", format: "date" },
  money: { type: "number" },
  reference: { type: "string" },
  array: { type: "array" },
  object: { type: "object" },
  json: {}, // raw provider passthrough — any JSON
};

/** Build a JSON-Schema `object` from a connector op's `IOSpec[]` (all fields optional). Pure. */
export function ioSpecSchema(specs: IOSpec[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const s of specs ?? []) properties[slug(s.name)] = s.type ? IO_JSON_TYPE[s.type] : {};
  return { type: "object", properties };
}

/** The response-shape a connector op returns — derived from `io.output` so typed output is not dead. */
export function connectorResponseSchema(t: AgentTool): Record<string, unknown> | undefined {
  if (t.kind !== "connector" || !t.io) return undefined;
  return ioSpecSchema(t.io.output);
}
export interface AgentDef {
  id: string;
  name: string;
  goal: string;
  /** human-augmentable operating instructions (system prompt); falls back to a default if empty. */
  instructions?: string;
  /** per-agent model + thinking level (Anthropic); fall back to env defaults if unset. */
  model?: string;
  effort?: "low" | "medium" | "high" | "max";
  capabilities: string[];
  tools: AgentTool[];
  /** agent-mode processes routed to this agent (SPEC-009) — run by judgement, not a fixed workflow. */
  processes?: Array<{ id: string; name: string; steps: string[] }>;
  /** external signals (webhook/schedule) routed to this agent (the TRIGGERS layer) — the agent's INPUT. */
  triggers?: TriggerInput[];
}

/**
 * The agent CONTRACT — an explicit, DERIVED **input · tools · output · context** projection of an agent.
 * NOT authored IR: it's computed from `AgentsDoc + DomainDoc + TriggersDoc` (like the tool list already
 * is), read-only, never round-tripped to text. It makes the four facets the agent's system prompt is
 * grounded in inspectable:
 *   · input   — the external signals routed to the agent (webhook/schedule/external) + the run task
 *   · tools   — the exact tool schemas the run loop sends (via `buildToolSchemas`, so contract == loop)
 *   · output  — the events the agent's command tools emit + the records they change
 *   · context — the domain the agent operates: its owned entities (typed fields) + the processes it owns
 */
export interface AgentContract {
  input: { triggers: Array<{ kind: string; name: string; ref: string }>; task: string };
  tools: ToolSchema[];
  output: { events: string[]; recordChanges: string[] };
  context: { entities: Array<{ name: string; attributes: AttributeSpec[] }>; processes: string[] };
}

/**
 * Derive an agent's CONTRACT from its resolved def + the domain (+ optional triggers). Pure + isomorphic.
 * Reuses `buildToolSchemas` so the contract's tools are byte-identical to the run loop's; reuses
 * `attributeSpecs` for the typed context fields; the output events come from the agent's command tools'
 * `emits` (the same facts folded into each tool description). Triggers are taken from the explicit
 * `triggers` arg when given, else from the def's own routed `triggers` (folded in `resolveAgentDefs`).
 */
export function agentContract(def: AgentDef, domain: DomainDoc, triggers?: TriggersDoc): AgentContract {
  const evName = new Map((domain.events ?? []).map((e) => [e.id, e.name || e.id]));
  const cmdBySlug = new Map((domain.commands ?? []).map((c) => [slug(c.id), c]));
  const aggById = new Map(domain.aggregates.map((a) => [a.id, a]));

  // output + owned records, derived from the agent's COMMAND tools (== the run loop's action surface).
  const recordIds = new Set<string>();
  const events = new Set<string>();
  for (const tool of def.tools) {
    if (tool.kind !== "command") continue;
    const cmd = cmdBySlug.get(tool.name);
    if (!cmd) continue;
    recordIds.add(cmd.aggregate);
    for (const e of cmd.emits ?? []) events.add(evName.get(e) ?? e);
  }
  const entities = [...recordIds]
    .map((id) => aggById.get(id))
    .filter((a): a is AggregateInput => !!a)
    .map((a) => ({ name: a.name || a.id, attributes: attributeSpecs(a) }));

  // input = the triggers ROUTED to this agent (target.kind === "agent" && ref === slug(id)) + the task.
  const routed = triggers ? triggers.triggers.filter((tr) => tr.target.kind === "agent" && tr.target.ref === slug(def.id)) : def.triggers ?? [];
  const input = {
    triggers: routed.map((tr) => ({ kind: tr.source, name: tr.name, ref: tr.path || tr.cron || tr.target.ref })),
    task: routed.find((tr) => tr.target.task)?.target.task || "Work toward your goal using the available tools and records.",
  };

  return {
    input,
    tools: buildToolSchemas(def),
    output: { events: [...events], recordChanges: entities.map((e) => e.name) },
    context: { entities, processes: (def.processes ?? []).map((p) => p.name) },
  };
}

function commandTool(c: { id: string; name?: string; aggregate: string; emits?: string[] }, fields: string[], evName: Map<string, string>): AgentTool {
  const res = `${slug(c.aggregate)}s`;
  const action = slug(c.name || c.id);
  const create = CREATE_VERB.test(`${action}_`);
  const emits = (c.emits ?? []).map((e) => evName.get(e) ?? e);
  return {
    name: slug(c.id),
    kind: "command",
    description: `${c.name || c.id} (on ${c.aggregate})${emits.length ? ` — emits ${emits.join(", ")}` : ""}`,
    invoke: { method: "POST", url: `{{SPINE_URL}}${create ? `/${res}` : `/${res}/{id}/${action}`}` },
    input: fields,
  };
}

/**
 * The fields an agent may FILTER an entity by: its typed attributes (`email`, `status`, …). Exposing these
 * by name is the point of `find_<entity>` — the model should see what it can look a record up by, not a
 * free-text query string it has to guess at. They're a subset of the spine's own column allow-list (`id` +
 * attributes + refs), so a name that passes here always passes there. `id` is excluded on purpose: `get_
 * <entity>` already fetches by id, and `input: ["id"]` is the discriminator the by-id read schema keys on.
 */
export function filterableFields(agg: Pick<AggregateInput, "attributes">): string[] {
  return [...new Set(attributeSpecs(agg).map((a) => slug(a.name)).filter((n) => n && n !== "id"))];
}

/**
 * The READ tools for one owned entity — the agent's DATA path. The spine exposes the routes (`GET /<entity>s`
 * list, `?<field>=<value>` filtered, `/:id` by id, all behind the same opt-in bearer as the writes); until
 * recently the agent had no tool pointing at them, so a playbook telling it to "read the relevant record" was
 * a lie. The resource is `${slug(aggregate)}s` — byte-identical to `commandTool` and to the spine's own
 * `routesFor`, so the URLs line up. Read stays capability-SCOPED: the caller only passes owned entities.
 *
 * `find_<entity>` is the one that scales: "is this email already a lead?" is a filtered GET, not `list_*` +
 * scan-the-table — fine at 200 rows, broken at 200k (and the list is capped at READ_ROW_CAP anyway, so a
 * scan would silently miss the answer).
 */
function readTools(agg: AggregateInput, taken: Set<string>): AgentTool[] {
  const entity = slug(agg.id);
  const res = `${entity}s`;
  const label = agg.name || agg.id;
  const filterable = filterableFields(agg);
  const tools: AgentTool[] = [
    {
      name: uniqueToolName(`list_${entity}`, taken),
      kind: "read",
      description: `List ${label} records — read-only; use it to find the record you need before acting.`,
      invoke: { method: "GET", url: `{{SPINE_URL}}/${res}` },
    },
    {
      name: uniqueToolName(`get_${entity}`, taken),
      kind: "read",
      description: `Fetch one ${label} by id — read-only; use it to check a record's current state.`,
      invoke: { method: "GET", url: `{{SPINE_URL}}/${res}/{id}` },
      input: ["id"],
    },
  ];
  if (filterable.length)
    tools.push({
      name: uniqueToolName(`find_${entity}`, taken),
      kind: "read",
      description: `Find ${label} records by field value — read-only. Prefer this over listing everything when you know what you're looking for (e.g. "does this one already exist?"). Exact match on ${filterable.join(", ")}; pass at least one, several narrow it (AND). Returns at most ${READ_ROW_CAP} matches; an empty result means no ${label} matches.`,
      invoke: { method: "GET", url: `{{SPINE_URL}}/${res}` },
      input: filterable,
    });
  return tools;
}

/**
 * Keep tool names unique + deterministic. A command tool is named `slug(command.id)`, so a command called
 * e.g. "List Leads" would collide with the derived `list_lead`. Commands are resolved first and WIN (they
 * are authored); a colliding read tool takes a stable suffixed name instead of clobbering the action.
 */
function uniqueToolName(base: string, taken: Set<string>): string {
  let name = base;
  if (taken.has(name)) name = `${base}_records`;
  for (let n = 2; taken.has(name); n++) name = `${base}_${n}`;
  taken.add(name);
  return name;
}

/**
 * The behaviour file for an agent NOBODY HAS DESIGNED yet — an obvious TBD, not a plausible template.
 *
 * The contract (`definitions/<id>.json`) says WHAT the agent may do; a behaviour must say HOW it decides
 * — what the business's terms mean, when to escalate, what order to check things in. Anything Kiln could
 * generate deterministically here could only restate the contract, so it would add nothing while making
 * an undesigned agent look designed. This file therefore names the gap, says how to close it, and points
 * at the contract rather than copying it — and carries `NO_BEHAVIOUR_MARKER` so the runtime refuses to
 * run the agent until a human (or Generate) replaces it.
 */
export function tbdBehaviour(d: AgentDef): string {
  return [
    NO_BEHAVIOUR_MARKER,
    `# ${d.name} — behaviour NOT YET DESIGNED`,
    "",
    "**This agent has no behaviour, so it has no system prompt. The runtime will refuse to run it.**",
    "",
    `Kiln does not invent a behaviour for you. \`../definitions/${d.id}.json\` already declares WHAT this`,
    "agent may do — its goal, its real tools, its inputs and outputs. A behaviour is the other half: **HOW",
    "it decides**. Restating the contract here would add nothing, and an undesigned agent that *looks*",
    "designed is worse than an obvious gap — this one can issue commands against the business's records.",
    "",
    "## How to close this",
    "Either **run Generate on the Agents stage in Kiln Studio** and re-export, or replace this whole file",
    "with the real playbook — in your own words, grounded in the tools the definition actually gives it:",
    "",
    "- **What the business's terms mean here** — what counts as qualified, urgent, complete, exceptional.",
    "- **When to escalate to a person** — which calls are never this agent's to make.",
    "- **What order to check things in** — what it reads before it acts, and what counts as enough to act.",
    "- **What it must never do** — the guardrails that matter in THIS business.",
    "",
    `> Once this file says how ${d.name} decides, delete the \`${NO_BEHAVIOUR_MARKER}\` marker at the top`,
    "> (replacing the file removes it anyway) — the runtime starts the agent as soon as the marker is gone.",
    "",
  ].join("\n");
}

/**
 * The agent-mode PROCESSES routed to this agent (SPEC-009 orchestration). These are multi-step processes
 * the router decided need judgement rather than a fixed workflow — so instead of an n8n pipeline, they
 * land here, in the agent's HOW. The agent already has the steps' commands as tools; this tells it which
 * end-to-end jobs it owns and the usual order, to adapt per case.
 */
function processesSection(d: AgentDef): string {
  if (!d.processes?.length) return "";
  return [
    "",
    "## Processes you own",
    "These end-to-end processes were routed to **you** (they need judgement, not a fixed workflow). Run",
    "each toward its outcome with your command tools — the arrow order is the usual path; adapt it to the",
    "specific case, and escalate the exceptions.",
    "",
    ...d.processes.map((p) => `- **${p.name}**: ${p.steps.join(" → ") || "(no steps)"}`),
    "",
  ].join("\n");
}

// ── the runnable runtime (generic + data-driven; loads a definition and runs the agent loop) ──

// The tool-argument JSON schema (shared by both providers). All string params — the spine coerces.
const SCHEMA_HELPER = `const IO_JSON_TYPE: Record<string, Record<string, unknown>> = { text: { type: "string" }, number: { type: "number" }, boolean: { type: "boolean" }, date: { type: "string", format: "date" }, money: { type: "number" }, reference: { type: "string" }, array: { type: "array" }, object: { type: "object" }, json: {} };
function toolParams(t: AgentTool): Record<string, unknown> {
  // connector (SPEC-013): typed I/O from the op's io.input — keep this in sync with @kiln/codegen ioSpecSchema.
  if (t.kind === "connector" && t.io) {
    const properties: Record<string, unknown> = {};
    for (const s of t.io.input ?? []) properties[s.name] = s.type ? (IO_JSON_TYPE[s.type] ?? {}) : {};
    return { type: "object", properties };
  }
  if (t.kind === "command" || t.kind === "external") {
    const properties: Record<string, { type: string }> = t.kind === "command" ? { id: { type: "string" } } : {};
    for (const f of t.input ?? []) properties[f] = { type: "string" };
    return { type: "object", properties };
  }
  // read: by-id needs the id (required); find exposes the entity's filterable fields (all optional — pass
  // at least one); a plain list takes no arguments.
  if (t.kind === "read") {
    if ((t.input ?? []).includes("id")) return { type: "object", properties: { id: { type: "string" } }, required: ["id"] };
    const properties: Record<string, { type: string }> = {};
    for (const f of t.input ?? []) properties[f] = { type: "string" };
    return { type: "object", properties };
  }
  if (t.kind === "notify") return { type: "object", properties: { recipient: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["recipient", "body"] };
  return { type: "object", properties: {} };
}`;

/**
 * REAL (non-template) version of the runtime's `toolParams` — the JSON-Schema for a tool's arguments.
 * Kept byte-equivalent to the string template above so the in-Studio "Test agent" loop (apps/service +
 * the hosted function) builds the SAME tool schemas the exported runtime would. Pure + isomorphic.
 */
export function agentToolParams(t: AgentTool): Record<string, unknown> {
  // connector (SPEC-013): typed I/O survives — build the arg schema from the op's `io.input` IOSpecs.
  if (t.kind === "connector" && t.io) return ioSpecSchema(t.io.input);
  if (t.kind === "command" || t.kind === "external") {
    const properties: Record<string, { type: string }> = t.kind === "command" ? { id: { type: "string" } } : {};
    for (const f of t.input ?? []) properties[f] = { type: "string" };
    return { type: "object", properties };
  }
  // read: by-id needs the id (required); find exposes the entity's filterable fields (all optional — pass
  // at least one); a plain list takes no arguments.
  if (t.kind === "read") {
    if ((t.input ?? []).includes("id")) return { type: "object", properties: { id: { type: "string" } }, required: ["id"] };
    const properties: Record<string, { type: string }> = {};
    for (const f of t.input ?? []) properties[f] = { type: "string" };
    return { type: "object", properties };
  }
  if (t.kind === "notify") return { type: "object", properties: { recipient: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["recipient", "body"] };
  return { type: "object", properties: {} };
}

const RUNTIME: Record<string, string> = {
  "src/def.ts": `export type AgentToolKind = "command" | "read" | "notify" | "email" | "slack" | "pdf" | "external" | "connector";
export type IOType = "text" | "number" | "boolean" | "date" | "money" | "reference" | "array" | "object" | "json";
export interface IOSpec { name: string; type?: IOType; }
export interface AgentTool { name: string; kind: AgentToolKind; description: string; invoke: Record<string, unknown>; input?: string[]; io?: { input: IOSpec[]; output: IOSpec[]; kind: "read" | "list" | "write" | "send" | "delete" }; }
export interface AgentDef {
  id: string;
  name: string;
  goal: string;
  instructions?: string; // human-augmentable system prompt (edit in the model → regenerate)
  model?: string; // per-agent model override (else ANTHROPIC_MODEL / OPENROUTER_MODEL)
  effort?: "low" | "medium" | "high" | "max"; // per-agent thinking level (Anthropic)
  capabilities: string[];
  tools: AgentTool[];
  processes?: { id: string; name: string; steps: string[] }[]; // agent-mode processes routed here (SPEC-009)
}
`,
  // Auth for EXTERNAL (vendor) calls. Standalone + dependency-free so it can be unit-tested as-is.
  //
  // The credential is only ever read from the environment, by the NAME the model declared. Nothing here
  // returns, logs, or embeds the value — the caller merges the result into request headers and drops it.
  "src/auth.ts": `export type ExternalAuth = "bearer" | "header" | "basic" | "none";
export interface ExternalInvoke {
  credentialEnv?: string; // NAME of the env var holding the credential (never the value)
  auth?: ExternalAuth;    // how to present it; omitted = "none" = send nothing
  headerName?: string;    // for auth: "header" — the header the vendor expects (e.g. X-API-Key)
}

/**
 * Build the auth headers for an external service call from the process environment.
 *
 * Fails LOUDLY when a credential is declared but absent: calling a vendor unauthenticated yields an opaque
 * 401 loop that looks like a vendor outage, so a missing env var is a startup-shaped error naming the var.
 * Errors name the VARIABLE, never its value.
 */
export function externalAuthHeaders(invoke: ExternalInvoke, env: Record<string, string | undefined> = process.env, service = "external service"): Record<string, string> {
  const scheme: ExternalAuth = invoke.auth ?? "none";
  if (!invoke.credentialEnv) {
    // A scheme with no credential to present would call the vendor in the clear — refuse rather than 401.
    if (scheme !== "none") throw new Error(service + ': auth "' + scheme + '" is declared but no credentialEnv names the variable holding the credential.');
    return {}; // nothing declared → send nothing (the pre-auth behaviour).
  }
  if (scheme === "none") return {}; // declared but deliberately unsent (the model validator warns: XS6).
  const value = env[invoke.credentialEnv];
  if (!value) throw new Error(service + ": environment variable " + invoke.credentialEnv + " is not set, so the call would go out unauthenticated. Set it in .env (the value belongs there, never in the model).");
  if (scheme === "bearer") return { authorization: "Bearer " + value };
  // Basic: the variable holds "user:pass"; the wire wants it base64'd.
  if (scheme === "basic") return { authorization: "Basic " + Buffer.from(value, "utf8").toString("base64") };
  if (!invoke.headerName) throw new Error(service + ': auth "header" needs a headerName (the header the vendor expects, e.g. X-API-Key).');
  return { [invoke.headerName.toLowerCase()]: value };
}
`,
  "src/tools.ts": `import type { AgentTool } from "./def";
import { externalAuthHeaders, type ExternalInvoke } from "./auth";

const SPINE = process.env.SPINE_URL || "http://localhost:3000";
const API_TOKEN = process.env.API_TOKEN; // if the spine requires auth, send the same bearer token
const READ_ROW_CAP = ${READ_ROW_CAP}; // a list read returns EVERY row — cap what we hand the model

// Execute one tool call. read → GET the spine; command → POST it; notify/comm → your integration (logged).
export async function executeTool(tool: AgentTool, input: Record<string, unknown>): Promise<unknown> {
  if (tool.kind === "read") {
    // The agent's DATA path: the spine's read routes (same bearer as the writes). A list returns the whole
    // table — cap it so a big table can't blow the agent's context, and SAY so rather than truncate silently.
    const template = String(tool.invoke.url ?? "");
    let url = template.replace("{{SPINE_URL}}", SPINE).replace("{id}", encodeURIComponent(String(input.id ?? "")));
    // find_<entity>: turn the tool's declared fields into an exact-match query string (?email=a%40b.com).
    // Only the fields the tool DECLARES are sent, and the spine independently allow-lists them against the
    // entity's real columns — so a filter it doesn't recognise is a 400, not a silently unfiltered dump.
    if (!template.includes("{id}")) {
      const params = new URLSearchParams();
      for (const field of tool.input ?? []) {
        const value = input[field];
        if (value !== undefined && value !== null && String(value) !== "") params.set(field, String(value));
      }
      if ([...params].length) url += "?" + params.toString();
    }
    const headers: Record<string, string> = {};
    if (API_TOKEN) headers.authorization = "Bearer " + API_TOKEN;
    const res = await fetch(url, { method: "GET", headers });
    const body = await res.json().catch(() => ({}));
    if (!Array.isArray(body)) return { status: res.status, body };
    if (body.length <= READ_ROW_CAP) return { status: res.status, rows: body, total: body.length };
    return {
      status: res.status,
      rows: body.slice(0, READ_ROW_CAP),
      total: body.length,
      truncated: true,
      note: "Showing the first " + READ_ROW_CAP + " of " + body.length + " records — narrow the question, or fetch a specific record by id.",
    };
  }
  if (tool.kind === "command") {
    const url = String(tool.invoke.url ?? "").replace("{{SPINE_URL}}", SPINE).replace("{id}", encodeURIComponent(String(input.id ?? "")));
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (API_TOKEN) headers.authorization = "Bearer " + API_TOKEN;
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(input) });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  }
  if (tool.kind === "notify") {
    // TODO: wire to your email/Slack integration (or the n8n comm webhooks). Logged so the loop proceeds.
    console.log("[notify]", JSON.stringify(input));
    return { sent: true, ...input };
  }
  if (tool.kind === "external") {
    // Delegate to an EXTERNAL service (a bought qualifier/reviewer). POST the vendor endpoint. For a sync
    // service the response IS the result; for async, the vendor calls back later (see the n8n callback
    // workflow) — here we just kick it off.
    //
    // The credential comes from THIS process's env, by the name the model declared (auth/credentialEnv on
    // the descriptor) — the agent calls the vendor directly, no n8n hop. A missing var throws rather than
    // calling out unauthenticated. Headers are built, sent, and dropped: never logged, never returned.
    const url = String(tool.invoke.url ?? "");
    const headers: Record<string, string> = { "content-type": "application/json", ...externalAuthHeaders(tool.invoke as ExternalInvoke, process.env, tool.name) };
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(input) });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, invocation: tool.invoke.invocation, body };
  }
  console.log("[" + tool.kind + "] " + tool.name, JSON.stringify(input));
  return { triggered: tool.name };
}
`,
  "src/providers/anthropic.ts": `import Anthropic from "@anthropic-ai/sdk";
import { executeTool } from "../tools";
import type { AgentDef, AgentTool } from "../def";

${SCHEMA_HELPER}

// The native Anthropic tool-use loop — best Claude fidelity (caching, tool semantics, thinking).
export async function runAnthropic(def: AgentDef, task: string, system: string): Promise<string> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const model = def.model || process.env.ANTHROPIC_MODEL || "claude-sonnet-5"; // per-agent override
  const tools: Anthropic.Tool[] = def.tools.map((t) => ({ name: t.name, description: t.description, input_schema: toolParams(t) as Anthropic.Tool.InputSchema }));
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: task }];
  // per-agent thinking level: adaptive thinking + effort (low|medium|high|max) when set.
  const effort = def.effort ? { thinking: { type: "adaptive" as const }, output_config: { effort: def.effort } } : {};
  let finalText = "";
  for (let step = 0; step < 12; step++) {
    const res = await client.messages.create({ model, max_tokens: 2048, system, tools, messages, ...effort });
    const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    if (text) { finalText = text; console.log("\\n[" + def.name + "] " + text); }
    messages.push({ role: "assistant", content: res.content });
    if (res.stop_reason === "end_turn") break;
    const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!toolUses.length) break;
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const tool = def.tools.find((t) => t.name === tu.name);
      console.log("  → " + tu.name + " " + JSON.stringify(tu.input));
      const out = tool ? await executeTool(tool, tu.input as Record<string, unknown>) : { error: "unknown tool " + tu.name };
      results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
    }
    messages.push({ role: "user", content: results });
  }
  return finalText;
}
`,
  "src/providers/openaiCompatible.ts": `import OpenAI from "openai";
import { executeTool } from "../tools";
import type { AgentDef, AgentTool } from "../def";

${SCHEMA_HELPER}

// ONE OpenAI-compatible loop for every gateway — OpenRouter, omniroute, or any self-hosted OpenAI-style
// endpoint (LiteLLM, vLLM, Ollama, Azure, …). PROVIDER selects which key / base URL / default model to read,
// so adding a gateway is env-only. Mirrors the Studio's openaiCompatible adapter.
function endpoint(provider: string): { apiKey?: string; baseURL: string; model: string } {
  if (provider === "openrouter")
    return { apiKey: process.env.OPENROUTER_API_KEY, baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1", model: process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5" };
  if (provider === "omniroute")
    return { apiKey: process.env.OMNIROUTE_API_KEY, baseURL: process.env.OMNIROUTE_BASE_URL || "http://localhost:8080/v1", model: process.env.OMNIROUTE_MODEL || "auto" };
  // generic OpenAI-compatible gateway
  return { apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1", model: process.env.OPENAI_MODEL || "gpt-4o" };
}

export async function runOpenAICompatible(def: AgentDef, task: string, system: string, provider = "openai-compatible"): Promise<string> {
  const ep = endpoint(provider);
  const client = new OpenAI({ apiKey: ep.apiKey, baseURL: ep.baseURL });
  const model = def.model || ep.model; // per-agent override, else the provider's default
  const tools = def.tools.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: toolParams(t) } }));
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    { role: "user", content: task },
  ];
  let finalText = "";
  for (let step = 0; step < 12; step++) {
    const res = await client.chat.completions.create({ model, max_tokens: 1024, tools, messages });
    const msg = res.choices[0]?.message;
    if (!msg) break;
    messages.push(msg);
    if (msg.content) { finalText = msg.content; console.log("\\n[" + def.name + "] " + msg.content); }
    const calls = msg.tool_calls ?? [];
    if (!calls.length) break;
    for (const call of calls) {
      const fn = call.type === "function" ? call.function : null;
      if (!fn) continue;
      console.log("  → " + fn.name + " " + fn.arguments);
      const input = JSON.parse(fn.arguments || "{}") as Record<string, unknown>;
      const tool = def.tools.find((t) => t.name === fn.name);
      const out = tool ? await executeTool(tool, input) : { error: "unknown tool " + fn.name };
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(out) });
    }
  }
  return finalText;
}
`,
  "src/run.ts": `import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runAnthropic } from "./providers/anthropic";
import { runOpenAICompatible } from "./providers/openaiCompatible";
import type { AgentDef } from "./def";

const here = dirname(fileURLToPath(import.meta.url));

// The marker Kiln writes into a behaviour NOBODY has designed yet (see behaviours/<id>.md). A marker, not
// prose-sniffing: write a real behaviour and it's gone, so the agent just runs.
const NO_BEHAVIOUR_MARKER = ${JSON.stringify(NO_BEHAVIOUR_MARKER)};

export function definitionPath(id: string): string { return join(here, "..", "definitions", id + ".json"); }
export function agentExists(id: string): boolean { return existsSync(definitionPath(id)); }

export interface AgentRunResult { agent: string; task: string; result: string; }

/**
 * Load an agent's definition + its behaviour playbook (the "HOW"), pick the provider, run the loop,
 * return the final text. Shared by the CLI (runner.ts) and the HTTP server (server.ts) so a webhook /
 * trigger can WAKE an agent the same way a human does from the shell.
 */
export async function runAgent(id: string, task: string): Promise<AgentRunResult> {
  const def: AgentDef = JSON.parse(readFileSync(definitionPath(id), "utf8"));
  const t = (task ?? "").trim() || "Work toward your goal using the available tools and records.";
  // behaviour = the agent's system prompt; edit behaviours/<id>.md to change how it works.
  const behaviourPath = join(here, "..", "behaviours", id + ".md");
  const system = existsSync(behaviourPath) ? readFileSync(behaviourPath, "utf8") : "You are " + def.name + ". Goal: " + def.goal;
  // Nobody designed this agent: its behaviour is still the exported TBD. Refuse — a placeholder that only
  // restates the contract is not a design, and this agent can issue commands against the business records.
  if (system.includes(NO_BEHAVIOUR_MARKER)) {
    throw new Error(
      "agents/behaviours/" + id + ".md has no behaviour yet — it is still the NOT-YET-DESIGNED placeholder, so "
      + def.name + " has no system prompt and will not run. Write HOW this agent decides (what your terms mean, "
      + "when to escalate, what to check first) — or run Generate on the Agents stage in Kiln Studio and re-export "
      + "— then remove the " + NO_BEHAVIOUR_MARKER + " marker.",
    );
  }
  // Provider: Anthropic native by default (best Claude fidelity); any OpenAI-compatible gateway otherwise
  // (openrouter | omniroute | openai-compatible). PROVIDER wins; else infer from whichever key is set.
  const provider = (process.env.PROVIDER
    || (process.env.OPENROUTER_API_KEY ? "openrouter"
      : process.env.OMNIROUTE_API_KEY ? "omniroute"
        : process.env.OPENAI_API_KEY ? "openai-compatible" : "anthropic")).trim();
  const result = provider === "anthropic"
    ? await runAnthropic(def, t, system)
    : await runOpenAICompatible(def, t, system, provider);
  return { agent: id, task: t, result };
}
`,
  "src/runner.ts": `import { runAgent } from "./run";

// CLI entry: \`pnpm start <agent-id> [task…]\`. For the HTTP entry (webhooks wake an agent) see server.ts.
const id = process.argv[2];
if (!id) { console.error("usage: pnpm start <agent-id> [task…]  (agent ids: see definitions/)"); process.exit(1); }
const task = process.argv.slice(3).join(" ");
runAgent(id, task)
  .then((r) => console.log("\\n— done —\\n" + r.result))
  .catch((e: unknown) => { console.error(e); process.exit(1); });
`,
  "src/server.ts": `import express from "express";
import { runAgent, agentExists } from "./run";

// HTTP mode: a tiny server so a webhook / trigger (see ../n8n trigger_* workflows) can WAKE an agent.
// POST /run { "agent": "<id>", "task": "<what to do>" } → runs the loop, returns the agent's summary.
const app = express();
app.use(express.json());

app.get("/health", (_req, res) => { res.json({ ok: true }); });

app.post("/run", async (req, res) => {
  const body = (req.body ?? {}) as { agent?: string; task?: string };
  const agent = String(body.agent ?? "");
  if (!agent) { res.status(400).json({ error: "agent required" }); return; }
  if (!agentExists(agent)) { res.status(404).json({ error: "unknown agent " + agent }); return; }
  try {
    res.json(await runAgent(agent, String(body.task ?? "")));
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

const port = Number(process.env.AGENT_PORT || 3100);
app.listen(port, () => { console.log("agent runner on :" + port + "  (POST /run { agent, task })"); });
`,
  "package.json": JSON.stringify(
    {
      name: "generated-agents",
      private: true,
      type: "module",
      packageManager: "pnpm@9.12.0",
      engines: { node: ">=20" },
      scripts: { start: "tsx src/runner.ts", serve: "tsx src/server.ts", typecheck: "tsc --noEmit", lint: "eslint src" },
      dependencies: { "@anthropic-ai/sdk": "^0.110.0", openai: "^4.67.0", express: "^4.21.0" },
      devDependencies: { tsx: "^4.19.0", typescript: "^5.6.2", "@types/node": "^20.16.5", "@types/express": "^4.17.21", eslint: "^9.11.0", "@eslint/js": "^9.11.0", "typescript-eslint": "^8.6.0", globals: "^15.9.0" },
    },
    null,
    2,
  ),
  "tsconfig.json": JSON.stringify(
    { compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, noEmit: true, esModuleInterop: true, skipLibCheck: true, lib: ["ES2022", "DOM"], types: ["node"] }, include: ["src"] },
    null,
    2,
  ),
  "eslint.config.js": `import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, {
  languageOptions: { globals: { ...globals.node } },
  rules: { "@typescript-eslint/no-explicit-any": "warn", "@typescript-eslint/no-unused-vars": ["error", { args: "none", varsIgnorePattern: "^_" }] },
});
`,
  ".gitignore": "node_modules\n.env\n",
};

// ── SPEC-013 Phase B1: the emitted CONNECTOR runtime (only added when a grant references a connector) ──
//
// `agents/src/nango.ts` — the executable mirror of `@kiln/codegen/connectorRuntime.ts`: the async Nango
// token resolver (raw fetch, no SDK), the write-op invocation gate, and the secret-free audit log. It uses
// `process.env` / `fetch` (Node globals in the generated app). The SECRET (`NANGO_SECRET_KEY`) and the
// resolved provider token are EPHEMERAL — used for the one call, never persisted or logged (SEC5/SEC7/TA1).
const NANGO_TS = `export type ConnectorAuth = Record<string, string>;
export type ConnectorOp = (auth: ConnectorAuth, input: Record<string, unknown>) => Promise<unknown>;
export interface ConnectorInvoke { connector: string; op: string; kind: "read" | "list" | "write" | "send" | "delete"; autonomous?: boolean; connectionRef?: string; }
export interface ConnectorAuditEntry { agentId: string; toolId: string; op: string; connectionRef: string; ts: number; outcome: "ok" | "error" | "confirmation-required" | "no-adapter"; }

// SEC4 — the ops gated by a per-invocation human confirmation (a write with reach into a real system).
export const GATED_KINDS = new Set<ConnectorInvoke["kind"]>(["write", "send", "delete"]);
export function requiresConfirmation(kind: ConnectorInvoke["kind"], autonomous?: boolean): boolean {
  return GATED_KINDS.has(kind) && !autonomous;
}

// SEC5 — a secret-free audit entry: identity + what ran + outcome. NEVER the token or the response body.
function auditEntry(base: Omit<ConnectorAuditEntry, "ts">): ConnectorAuditEntry {
  return { agentId: base.agentId, toolId: base.toolId, op: base.op, connectionRef: base.connectionRef, ts: Date.now(), outcome: base.outcome };
}

// SEC1/SEC7/TA1 — resolve a FRESH provider token for a Nango connection via a RAW fetch to Nango's REST API
// (no Nango SDK). NANGO_SECRET_KEY is server-only; the token is returned for the one call, never stored/logged.
export async function resolveConnectorAuth(connectionRef: string): Promise<ConnectorAuth> {
  const secret = process.env.NANGO_SECRET_KEY;
  if (!secret) throw new Error("NANGO_SECRET_KEY is not set — cannot resolve a connector token. Set it in .env (server-side only; it must never reach the browser or the model).");
  if (!connectionRef) throw new Error("this connector grant has no connectionRef — connect a live account first (a grant with no connection is not runnable).");
  const host = (process.env.NANGO_HOST || "https://api.nango.dev").replace(/\\/+$/, "");
  const providerConfigKey = process.env.NANGO_PROVIDER_CONFIG_KEY || "google-sheets";
  const url = host + "/connection/" + encodeURIComponent(connectionRef) + "?provider_config_key=" + encodeURIComponent(providerConfigKey) + "&refresh_token=true";
  // The SECRET goes ONLY to Nango over this server-side call — never returned to the agent loop.
  const res = await fetch(url, { headers: { authorization: "Bearer " + secret } });
  if (!res.ok) throw new Error("Nango connection lookup failed (" + res.status + ") — check NANGO_HOST / NANGO_SECRET_KEY / NANGO_PROVIDER_CONFIG_KEY and that the connection is live.");
  const data = (await res.json().catch(() => ({}))) as { credentials?: { access_token?: string; raw?: { access_token?: string } } };
  const token = data?.credentials?.access_token ?? data?.credentials?.raw?.access_token;
  if (!token) throw new Error("Nango returned no access token for this connection (is the live account still connected and authorized?).");
  return { authorization: "Bearer " + token };
}

// SEC4 — the human-confirmation seam. DEFAULT is DENY: a headless run must never silently perform a write.
// It routes a notify (the same human-escalation idiom the runtime uses) and returns false. Wire this to your
// real approval channel to let an approved write proceed; an 'autonomous' grant bypasses the gate entirely.
async function requestApproval(entry: { agentId: string; toolId: string; op: string; kind: string }): Promise<boolean> {
  console.log("[notify] connector write needs approval: " + JSON.stringify(entry));
  return false;
}

// Execute one granted connector op — the write-op gate + audit (SEC4/SEC5). The gate is at INVOCATION.
export async function runConnector(invoke: ConnectorInvoke, input: Record<string, unknown>, connectors: Record<string, Record<string, ConnectorOp>>, agentId: string): Promise<unknown> {
  const connectionRef = invoke.connectionRef || "";
  const base = { agentId, toolId: invoke.connector, op: invoke.op, connectionRef };
  if (requiresConfirmation(invoke.kind, invoke.autonomous)) {
    const approved = await requestApproval({ ...base, kind: invoke.kind });
    if (!approved) {
      console.log("[connector-audit] " + JSON.stringify(auditEntry({ ...base, outcome: "confirmation-required" })));
      return { status: "pending_confirmation", message: "The '" + invoke.op + "' operation writes to " + invoke.connector + " and needs human approval before it runs. It was NOT executed. Approve it, or grant this connector 'autonomous' access." };
    }
  }
  const opFn = connectors?.[invoke.connector]?.[invoke.op];
  if (!opFn) {
    console.log("[connector-audit] " + JSON.stringify(auditEntry({ ...base, outcome: "no-adapter" })));
    return { error: "no connector runtime is registered for " + invoke.connector + "." + invoke.op };
  }
  try {
    const auth = await resolveConnectorAuth(connectionRef); // ephemeral token — used here, never stored
    const out = await opFn(auth, input);
    console.log("[connector-audit] " + JSON.stringify(auditEntry({ ...base, outcome: "ok" })));
    return out;
  } catch (e: unknown) {
    console.log("[connector-audit] " + JSON.stringify(auditEntry({ ...base, outcome: "error" })));
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
`;

/**
 * Build the emitted `agents/src/connectors.ts` — the per-connector op dispatch table. For each granted
 * (connector, op) whose adapter is REGISTERED, embed the adapter's `emitNango(op).runtime` (the provider
 * glue). Deterministic: connectors + ops sorted. Returns `undefined` when no granted op resolves to an
 * adapter (→ no connector runtime is emitted, and the export stays byte-identical to the no-grant case).
 */
export function connectorsModule(defs: AgentDef[]): string | undefined {
  // Collect the granted (connector, op) pairs across every agent.
  const byConnector = new Map<string, Set<string>>();
  for (const d of defs) {
    for (const t of d.tools) {
      if (t.kind !== "connector") continue;
      const inv = t.invoke as { connector?: string; op?: string };
      if (!inv.connector || !inv.op) continue;
      (byConnector.get(inv.connector) ?? byConnector.set(inv.connector, new Set()).get(inv.connector)!).add(inv.op);
    }
  }
  const blocks: string[] = [];
  for (const connectorId of [...byConnector.keys()].sort()) {
    const adapter = getConnectorAdapter(connectorId);
    if (!adapter) continue; // granted but no registered adapter — nothing to emit (runtime → outcome:"no-adapter").
    const ops = [...byConnector.get(connectorId)!].sort();
    const opLines = ops.map((op) => `    ${JSON.stringify(op)}: ${adapter.emitNango(op, { toolId: connectorId, connectionRef: "" } as never).runtime},`);
    blocks.push(`  ${JSON.stringify(connectorId)}: {\n${opLines.join("\n")}\n  },`);
  }
  if (!blocks.length) return undefined;
  return `import type { ConnectorOp } from "./nango";

// SPEC-013 — the per-connector op dispatch table. ALL provider glue (base URL, method, path, param mapping)
// is emitted HERE from each ConnectorAdapter's emitNango — NEVER from model.json (SEC3). Each op is an
// \`async (auth, input) => …\` that presents the Nango-brokered \`auth\` header and calls the provider.
export const CONNECTORS: Record<string, Record<string, ConnectorOp>> = {
${blocks.join("\n")}
};
`;
}

/**
 * The connector-aware `agents/src/tools.ts` — the base runtime with the `connector` branch + its imports
 * spliced in. Built by REPLACING two anchors in the base string, so the no-connector path returns the base
 * bytes verbatim (byte-identity, TA6). Only used when `connectorsModule` emitted a dispatch table.
 */
function toolsWithConnectors(): string {
  const base = RUNTIME["src/tools.ts"];
  const withImport = base.replace(
    'import { externalAuthHeaders, type ExternalInvoke } from "./auth";',
    'import { externalAuthHeaders, type ExternalInvoke } from "./auth";\nimport { CONNECTORS } from "./connectors";\nimport { runConnector, type ConnectorInvoke } from "./nango";',
  );
  return withImport.replace(
    '  console.log("[" + tool.kind + "] " + tool.name, JSON.stringify(input));',
    `  if (tool.kind === "connector") {
    // SPEC-013 — resolve the Nango token, run the write-op gate (SEC4), execute the adapter glue, audit (SEC5).
    // The provider glue + destination live in CONNECTORS (emitted from the adapter), never in the model.
    return runConnector(tool.invoke as ConnectorInvoke, input, CONNECTORS, process.env.AGENT_ID || "agent");
  }
  console.log("[" + tool.kind + "] " + tool.name, JSON.stringify(input));`,
  );
}

// SPEC-013 — the Nango broker vars, appended to .env.example ONLY when a connector is granted. NAMES ONLY:
// the SECRET's value lives in .env (gitignored), never in the committed model. Self-host NANGO_HOST (SEC7).
const CONNECTOR_ENV_EXAMPLE = `
# ── Connectors (Nango — brokered OAuth for agent tools) ────────────────────────────────────────────
# An agent is granted a connector (e.g. Google Sheets). The runtime resolves a FRESH provider token from
# Nango at call time — the secret is server-side only, the token is ephemeral (never persisted or logged).
NANGO_SECRET_KEY=                 # your Nango SECRET key (server-side only — NEVER ship to a browser/model)
NANGO_HOST=https://api.nango.dev  # self-host recommended (e.g. http://localhost:3003) — see the docs
NANGO_PROVIDER_CONFIG_KEY=google-sheets  # the Nango integration id whose OAuth scopes back the connection
# GOOGLE_SHEETS_SPREADSHEET_ID=   # optional default spreadsheet id if an op doesn't pass one
`;

/** Default agent-runtime engine, baked into the exported .env.example so an app built on a gateway ships
 *  pre-pointed at it (still overridable at deploy time). Unset → Anthropic-first. */
export interface AgentDefaults { provider?: string; model?: string; baseUrl?: string }

/** The exported agents/.env.example — leads with the engine the model was built on, then lists the rest. */
/**
 * The credential block for the declared external services: one commented line per distinct env var, naming
 * the service(s) that need it. NAMES ONLY — `.env.example` is committed; the real values go in `.env`.
 * Services that declare no credential contribute nothing (an unauthenticated vendor needs no var).
 */
export function externalServicesEnvExample(services?: ExternalServicesDoc): string {
  const byVar = new Map<string, string[]>();
  for (const s of services?.services ?? []) {
    if (!s.credentialEnv || (s.auth ?? "none") === "none") continue;
    byVar.set(s.credentialEnv, [...(byVar.get(s.credentialEnv) ?? []), s.name || s.id]);
  }
  if (!byVar.size) return "";
  const lines = [...byVar.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([v, names]) => `${v}=            # ${names.join(", ")}`);
  return `\n# ── External services ─────────────────────────────────────────────────────────────
# Credentials for the vendors your agents delegate to. Each agent calls its vendor DIRECTLY with the
# value below — set it here in .env, never in the model (model.json is committed to git).
${lines.join("\n")}
`;
}

function agentEnvExample(d?: AgentDefaults, services?: ExternalServicesDoc): string {
  const provider = d?.provider || "anthropic";
  const blocks: Record<string, string> = {
    anthropic: `# Anthropic native — best Claude fidelity; per-agent model/effort apply here.
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=${(provider === "anthropic" && d?.model) || "claude-sonnet-5"}
`,
    openrouter: `# OpenRouter — one OpenAI-compatible integration, ANY model (Claude / GPT / Gemini / Llama / self-hosted).
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=${(provider === "openrouter" && d?.model) || "anthropic/claude-sonnet-4.5"}
`,
    omniroute: `# omniroute — self-hosted OpenAI-compatible gateway; point at your gateway + set its key.
OMNIROUTE_BASE_URL=${(provider === "omniroute" && d?.baseUrl) || "http://localhost:8080/v1"}
OMNIROUTE_API_KEY=...
OMNIROUTE_MODEL=${(provider === "omniroute" && d?.model) || "auto"}
`,
    "openai-compatible": `# Any other OpenAI-compatible endpoint (LiteLLM, vLLM, Ollama, Azure OpenAI, …).
OPENAI_BASE_URL=${(provider === "openai-compatible" && d?.baseUrl) || "https://api.openai.com/v1"}
OPENAI_API_KEY=...
OPENAI_MODEL=${(provider === "openai-compatible" && d?.model) || "gpt-4o"}
`,
  };
  const order = [provider, ...Object.keys(blocks).filter((k) => k !== provider)];
  const note = provider !== "anthropic"
    ? `# This app was built on "${provider}" in Kiln, so PROVIDER defaults to it. Anthropic stays available — switch PROVIDER to use it.\n`
    : "";
  return `# Copy to .env. PROVIDER picks the engine; fill in that engine's block below.
PROVIDER=${provider}                         # anthropic | openrouter | omniroute | openai-compatible
SPINE_URL=http://localhost:3000
# If the spine requires auth (its API_TOKEN is set), send the SAME token on command calls:
# API_TOKEN=change-me
${note}
${order.map((k) => blocks[k]).join("\n")}${externalServicesEnvExample(services)}`;
}

/**
 * Resolve, per agent, the concrete tools it can use — its owned commands, the `notify` router, the comm
 * actions on its entities, and any external services it may delegate to — plus fold in the SPEC-009
 * agent-mode processes it owns. Pure + isomorphic (no SDK, no `node:*`), so the exported runtime
 * (`agentsAdapter`), the in-Studio "Test agent" loop (apps/service), and the hosted function all share
 * ONE resolution. Extracting it here is the seam the server-side test loop reuses.
 */
export function resolveAgentDefs(caps: CapabilityDoc, domain: DomainDoc, agents?: AgentsDoc, comms?: CommunicationsDoc, workflows?: WorkflowsDoc, services?: ExternalServicesDoc, triggers?: TriggersDoc, tools?: ToolsDoc): AgentDef[] {
  if (!agents?.agents?.length) return [];
  // SPEC-013: index the authored connector tools so a grant can be resolved to its typed operations.
  const toolById = new Map((tools?.tools ?? []).map((t) => [t.id, t]));
  const evName = new Map((domain.events ?? []).map((e) => [e.id, e.name || e.id]));
  const cmdName = new Map((domain.commands ?? []).map((c) => [c.id, c.name || c.id]));
  const cmdCap = new Map((domain.commands ?? []).map((c) => [c.id, c.capability]));
  const capName = new Map(caps.capabilities.map((c) => [c.id, c.name || c.id]));
  const defs: AgentDef[] = [];

  // SPEC-009 mode-driven fold: assign each agent-mode process to the agent whose capabilities cover the
  // most of the process's command-capabilities (ties → first). It becomes part of that agent's HOW.
  const procByAgent = new Map<string, Array<{ id: string; name: string; steps: string[] }>>();
  for (const w of (workflows?.workflows ?? []).filter((w) => w.mode === "agent")) {
    const wfCaps = new Set((w.steps ?? []).map((s) => cmdCap.get(s)).filter((c): c is string => !!c));
    let best: string | undefined;
    let bestOverlap = 0;
    for (const a of agents.agents) {
      const overlap = [...wfCaps].filter((c) => (a.capabilities ?? []).includes(c)).length;
      if (overlap > bestOverlap) { bestOverlap = overlap; best = a.id; }
    }
    if (best) (procByAgent.get(best) ?? procByAgent.set(best, []).get(best)!).push({ id: w.id, name: w.name || w.id, steps: (w.steps ?? []).map((s) => cmdName.get(s) ?? s) });
  }

  for (const a of agents.agents) {
    const agentCaps = new Set(a.capabilities ?? []);
    const ownedEntities = new Set(domain.aggregates.filter((x) => agentCaps.has(x.owner)).map((x) => x.id));
    const tools: AgentTool[] = [];
    for (const c of domain.commands ?? []) {
      if (!ownedEntities.has(c.aggregate)) continue;
      const agg = domain.aggregates.find((x) => x.id === c.aggregate);
      tools.push(commandTool(c, attributeSpecs(agg ?? { attributes: [] }).map((f) => slug(f.name)), evName));
    }
    // READ tools — the agent's data path (the spine's existing GET routes). Same capability scope as the
    // commands: an agent can only look up the entities its capabilities OWN. Resolved after the commands
    // so an authored command name always wins a name collision.
    const taken = new Set(tools.map((t) => t.name));
    for (const agg of domain.aggregates) {
      if (!ownedEntities.has(agg.id)) continue;
      tools.push(...readTools(agg, taken));
    }
    tools.push({ name: "notify", kind: "notify", description: "Send an email or Slack message to a person or channel — e.g. route to a human for a decision, then continue when they respond.", invoke: { channels: ["email", "slack"], via: "n8n" } });
    for (const cm of comms?.actions ?? []) {
      // documents (pdf/spreadsheet) are rendered artifacts, not agent messaging tools — only email/slack.
      if (!ownedEntities.has(cm.entity) || (cm.channel !== "email" && cm.channel !== "slack")) continue;
      tools.push({ name: slug(cm.id), kind: cm.channel, description: `${cm.name} → ${cm.recipient}`, invoke: { channel: cm.channel, on: cm.on, template: `templates/${cm.id}.md` } });
    }
    // External services the agent can DELEGATE to (a bought qualifier/reviewer) — for the entities it owns.
    for (const s of services?.services ?? []) {
      if (!s.entity || !ownedEntities.has(s.entity)) continue;
      // invoke carries the credential's env var NAME (+ scheme) so the runtime can authenticate the call.
      // Names only — the definition JSON this lands in is committed; the value stays in the deploy's .env.
      tools.push({ name: slug(s.id), kind: "external", description: `Delegate to ${s.name} (${s.invocation}) — ${s.rationale ?? "external service"}`, invoke: { url: s.endpoint, invocation: s.invocation, service: s.id, auth: s.auth ?? "none", credentialEnv: s.credentialEnv, headerName: s.headerName }, input: Object.keys(s.requestMapping ?? {}) });
    }
    // SPEC-013 CONNECTOR GRANTS fold: each granted op becomes a `connector` tool named `<toolId>_<op>`
    // (deterministic namespacing via uniqueToolName, so it never clobbers an authored command). The op's
    // typed I/O + semantic kind ride on `io`; NO destination is carried — the runtime resolves it via the
    // registered ConnectorAdapter (Phase B). Only grants whose tool + op actually resolve are folded.
    for (const g of a.grants ?? []) {
      const tool = toolById.get(g.toolId);
      if (!tool) continue; // an unresolved grant — validator TC1 reports it; nothing to project.
      for (const opName of g.operations ?? []) {
        const op = (tool.operations ?? []).find((o) => o.name === opName);
        if (!op) continue; // an op the tool doesn't declare — TC2 reports it.
        const name = uniqueToolName(`${slug(tool.id)}_${slug(op.name)}`, taken);
        tools.push({
          name,
          kind: "connector",
          description: `${op.name} on ${tool.providerLabel || tool.name} (${op.kind}) via ${tool.name}`,
          // NO destination — only the connector id (which ConnectorAdapter to run), the op, its kind (the
          // Phase-B invocation gate reads this), the opaque connectionRef (TC7: never a token/PII), and the
          // autonomous flag. The provider glue lives in the adapter's emitNango, resolved at export time.
          invoke: { connector: tool.id, op: op.name, kind: op.kind, ...(g.connectionRef ? { connectionRef: g.connectionRef } : {}), ...(g.autonomous ? { autonomous: true } : {}) },
          io: { input: op.input ?? [], output: op.output ?? [], kind: op.kind },
        });
      }
    }
    // TRIGGERS fold: the external signals (webhook/schedule/external) ROUTED to this agent are its INPUT.
    // Match a trigger whose target is this agent (target.kind === "agent" && ref === slug(a.id)) — the same
    // routing `mockTriggers`/`route()` uses. Optional + backward-compatible (empty when no triggers doc).
    const routed = (triggers?.triggers ?? []).filter((tr) => tr.target.kind === "agent" && tr.target.ref === slug(a.id));
    defs.push({ id: slug(a.id), name: a.name || a.id, goal: a.goal || "", instructions: a.instructions, model: a.model, effort: a.effort, capabilities: (a.capabilities ?? []).map((c) => capName.get(c) ?? c), tools, processes: procByAgent.get(a.id) ?? [], triggers: routed });
  }
  return defs;
}

/** Resolve each agent's toolset and emit a runnable, provider-flexible runtime (definitions + loop). */
export function agentsAdapter(caps: CapabilityDoc, domain: DomainDoc, agents?: AgentsDoc, comms?: CommunicationsDoc, workflows?: WorkflowsDoc, services?: ExternalServicesDoc, agentDefaults?: AgentDefaults, triggers?: TriggersDoc, tools?: ToolsDoc): Record<string, string> {
  if (!agents?.agents?.length) return {};
  // Ground the exported behaviour in the agent's INPUT: use the authored triggers when present, else the
  // deterministic defaults (external/time events → webhook/schedule routes), so the contract isn't empty.
  const trig = triggers ?? mockTriggers(caps, domain, workflows, agents);
  const defs = resolveAgentDefs(caps, domain, agents, comms, workflows, services, trig, tools);

  const files: Record<string, string> = {};
  for (const [rel, content] of Object.entries(RUNTIME)) files[`agents/${rel}`] = content;
  // SPEC-013 Phase B1 — CONNECTOR runtime. Emitted ONLY when a grant references a registered connector; the
  // `connector` branch + its imports are then spliced into tools.ts. With no grant, nothing below runs and
  // the export stays byte-identical to the pre-connector runtime (TA6, guarded by the connectors test).
  const connectors = connectorsModule(defs);
  const hasConnectors = !!connectors;
  if (hasConnectors) {
    files["agents/src/nango.ts"] = NANGO_TS;
    files["agents/src/connectors.ts"] = connectors!;
    files["agents/src/tools.ts"] = toolsWithConnectors();
  }
  // engine-aware (leads with the built-on provider) + a named var per external service credential + (when a
  // connector is granted) the Nango broker vars (names only — the real secret stays in .env, never the model).
  files["agents/.env.example"] = agentEnvExample(agentDefaults, services) + (hasConnectors ? CONNECTOR_ENV_EXAMPLE : "");
  for (const d of defs) {
    // definition = structure + config (WHAT it may do); behaviour = the authored markdown playbook (HOW it
    // decides). With no authored behaviour we ship an obvious TBD, never a generated template: Kiln does
    // not invent a design, and the runtime refuses the TBD rather than run on a plausible-looking stand-in.
    files[`agents/definitions/${d.id}.json`] = JSON.stringify({ ...d, instructions: undefined }, null, 2);
    files[`agents/behaviours/${d.id}.md`] = (d.instructions?.trim() ? d.instructions.trim() + "\n" : tbdBehaviour(d)) + processesSection(d);
  }
  files["agents/README.md"] = `# Agents — a runnable, provider-flexible agent runtime

Goal-driven operators. Each \`definitions/<id>.json\` is a definition the runtime loads: a **goal** and
its **tools** (commands = the spine endpoints the UI/workflows also call; \`notify\` = the human-in-the-
loop router; comm actions = pre-built messages).

\`\`\`bash
pnpm install
# start the spine first (see ../spine), then either:
# 1) CLI — run one agent once:
SPINE_URL=http://localhost:3000 ANTHROPIC_API_KEY=sk-ant-... pnpm start ${defs[0]?.id ?? "<agent-id>"} "qualify the newest lead"
# 2) HTTP — leave it running so webhooks/triggers can wake an agent:
SPINE_URL=http://localhost:3000 ANTHROPIC_API_KEY=sk-ant-... pnpm serve   # POST /run { agent, task } on :3100
curl -sX POST localhost:3100/run -H 'content-type: application/json' -d '{"agent":"${defs[0]?.id ?? "<agent-id>"}","task":"qualify the newest lead"}'
\`\`\`

**Two ways to run** — the CLI (\`pnpm start\`) fires one agent for one task and exits; the HTTP server
(\`pnpm serve\`) stays up so an external signal can wake an agent. The generated **Triggers** (see the
\`../n8n\` \`trigger_*\` workflows) POST \`/run\` here, so a webhook or a schedule can start an agent — the
same way a workflow or a command can be triggered.

## The two files per agent
- \`definitions/<id>.json\` — **structure + config**: goal, tools (derived from the agent's capabilities),
  \`model\`, \`effort\` (thinking level: low|medium|high|max).
- \`behaviours/<id>.md\` — **the "HOW"**: the agent's playbook / system prompt. Its role, how it works its
  tools, when to escalate to a human, guardrails. **This is what you edit to change how the agent
  behaves** — like a skill file. The runtime loads it as the system prompt.

Which agents exist and which tools they get is derived from their **capabilities** (change an agent's
capabilities → its command tools change). Per-agent \`model\`/\`effort\` apply on Anthropic; OpenRouter uses
\`model\`. An agent doesn't have hardcoded procedure code — it *reasons* over its tools guided by the
playbook. (If you want fixed, deterministic steps instead, that's a **workflow**, not an agent.)

## Choosing a model / provider (\`.env\`)
\`PROVIDER\` picks the engine; the same four Kiln offers in Studio work here. \`.env.example\` **leads with the
engine this app was built on** — switch \`PROVIDER\` to use another. Per-agent \`model\`/\`effort\` (in the
definition) override the env default; \`effort\` is Anthropic-only.
- **Anthropic native** (\`PROVIDER=anthropic\`): \`ANTHROPIC_API_KEY\` + \`ANTHROPIC_MODEL\`. Best Claude fidelity.
- **OpenRouter** (\`PROVIDER=openrouter\`): \`OPENROUTER_API_KEY\` + \`OPENROUTER_MODEL\` (e.g. \`openai/gpt-4o\`,
  \`google/gemini-2.0-flash\`, \`meta-llama/llama-3.3-70b\`). One integration, any model.
- **omniroute** (\`PROVIDER=omniroute\`): self-hosted OpenAI-compatible gateway — \`OMNIROUTE_BASE_URL\` +
  \`OMNIROUTE_API_KEY\` + \`OMNIROUTE_MODEL\`.
- **Any OpenAI-compatible endpoint** (\`PROVIDER=openai-compatible\`): LiteLLM, vLLM, Ollama, Azure OpenAI —
  \`OPENAI_BASE_URL\` + \`OPENAI_API_KEY\` + \`OPENAI_MODEL\`.

**On flat-fee plans:** consumer subscriptions (Claude Max, ChatGPT Plus/Pro, Gemini Advanced) can NOT
power an app's agents — their terms forbid programmatic use and there's no official API. For predictable
cost use the API (prepaid credits / committed use) or self-host an open model via OpenRouter.

The loop (\`src/providers/*\`) gives the LLM the goal + tools and executes each tool call (\`src/tools.ts\`):
command tools POST the spine (which persists + emits events); \`notify\`/comm tools call your integration
(logged by default — wire them up). Agent-vs-workflow: an **agent** when the path is open-ended /
judgement-heavy; a **workflow** when the steps are fixed.
`;
  return files;
}
