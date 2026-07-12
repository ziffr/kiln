/**
 * @vbd/codegen/agents — wire agents to concrete TOOLS and emit a RUNNABLE, provider-flexible runtime.
 *
 * An agent (SPEC-008) is a goal + the capabilities it operates. This resolves, per agent, the tools it
 * can use — commands (the spine endpoints), a `notify` tool (human-in-the-loop router), the pre-built
 * comm actions — and emits a small TypeScript runtime that runs the agent loop over them. Two providers:
 * **Anthropic native** (default, best Claude fidelity) and **OpenRouter** (any model: Claude/GPT/Gemini/
 * Llama/self-hosted — one OpenAI-compatible integration). Commands are the universal action surface —
 * the UI clicks them, workflows sequence them, agents choose them. Pure and isomorphic.
 */

import { slug } from "@vbd/ir";
import { attributeSpecs, type CapabilityDoc, type DomainDoc, type AgentsDoc } from "@vbd/compiler";
import type { CommunicationsDoc } from "./comms.ts";

const CREATE_VERB = /^(create|add|register|open|new|capture|issue|request|submit|plan|record)_/;

export type AgentToolKind = "command" | "notify" | "email" | "slack" | "pdf";
export interface AgentTool {
  name: string;
  kind: AgentToolKind;
  description: string;
  invoke: Record<string, unknown>;
  input?: string[];
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

// ── the runnable runtime (generic + data-driven; loads a definition and runs the agent loop) ──

// The tool-argument JSON schema (shared by both providers). All string params — the spine coerces.
const SCHEMA_HELPER = `function toolParams(t: AgentTool): Record<string, unknown> {
  if (t.kind === "command") {
    const properties: Record<string, { type: string }> = { id: { type: "string" } };
    for (const f of t.input ?? []) properties[f] = { type: "string" };
    return { type: "object", properties };
  }
  if (t.kind === "notify") return { type: "object", properties: { recipient: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["recipient", "body"] };
  return { type: "object", properties: {} };
}`;

const RUNTIME: Record<string, string> = {
  "src/def.ts": `export type AgentToolKind = "command" | "notify" | "email" | "slack" | "pdf";
export interface AgentTool { name: string; kind: AgentToolKind; description: string; invoke: Record<string, unknown>; input?: string[]; }
export interface AgentDef {
  id: string;
  name: string;
  goal: string;
  instructions?: string; // human-augmentable system prompt (edit in the model → regenerate)
  model?: string; // per-agent model override (else ANTHROPIC_MODEL / OPENROUTER_MODEL)
  effort?: "low" | "medium" | "high" | "max"; // per-agent thinking level (Anthropic)
  capabilities: string[];
  tools: AgentTool[];
}
`,
  "src/tools.ts": `import type { AgentTool } from "./def";

const SPINE = process.env.SPINE_URL || "http://localhost:3000";

// Execute one tool call. command → POST the spine endpoint; notify/comm → your integration (logged here).
export async function executeTool(tool: AgentTool, input: Record<string, unknown>): Promise<unknown> {
  if (tool.kind === "command") {
    const url = String(tool.invoke.url ?? "").replace("{{SPINE_URL}}", SPINE).replace("{id}", encodeURIComponent(String(input.id ?? "")));
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  }
  if (tool.kind === "notify") {
    // TODO: wire to your email/Slack integration (or the n8n comm webhooks). Logged so the loop proceeds.
    console.log("[notify]", JSON.stringify(input));
    return { sent: true, ...input };
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
export async function runAnthropic(def: AgentDef, task: string): Promise<void> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const model = def.model || process.env.ANTHROPIC_MODEL || "claude-sonnet-5"; // per-agent override
  const tools: Anthropic.Tool[] = def.tools.map((t) => ({ name: t.name, description: t.description, input_schema: toolParams(t) as Anthropic.Tool.InputSchema }));
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: task }];
  const system = def.instructions || "You are " + def.name + ". Goal: " + def.goal + "\\nUse the tools to accomplish the task; call one at a time and stop when done. Then summarize what you did.";
  // per-agent thinking level: adaptive thinking + effort (low|medium|high|max) when set.
  const effort = def.effort ? { thinking: { type: "adaptive" as const }, output_config: { effort: def.effort } } : {};
  for (let step = 0; step < 12; step++) {
    const res = await client.messages.create({ model, max_tokens: 2048, system, tools, messages, ...effort });
    const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    if (text) console.log("\\n[" + def.name + "] " + text);
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
}
`,
  "src/providers/openrouter.ts": `import OpenAI from "openai";
import { executeTool } from "../tools";
import type { AgentDef, AgentTool } from "../def";

${SCHEMA_HELPER}

// OpenAI-compatible loop via OpenRouter — any model (Claude, GPT, Gemini, Llama, self-hosted, …).
export async function runOpenRouter(def: AgentDef, task: string): Promise<void> {
  const client = new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1" });
  const model = def.model || process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5"; // per-agent override
  const tools = def.tools.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: toolParams(t) } }));
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: def.instructions || "You are " + def.name + ". Goal: " + def.goal + ". Use the tools to accomplish the task; stop when done." },
    { role: "user", content: task },
  ];
  for (let step = 0; step < 12; step++) {
    const res = await client.chat.completions.create({ model, max_tokens: 1024, tools, messages });
    const msg = res.choices[0]?.message;
    if (!msg) break;
    messages.push(msg);
    if (msg.content) console.log("\\n[" + def.name + "] " + msg.content);
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
}
`,
  "src/runner.ts": `import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runAnthropic } from "./providers/anthropic";
import { runOpenRouter } from "./providers/openrouter";
import type { AgentDef } from "./def";

const here = dirname(fileURLToPath(import.meta.url));
const id = process.argv[2];
if (!id) { console.error("usage: pnpm start <agent-id> [task…]  (agent ids: see definitions/)"); process.exit(1); }
const def: AgentDef = JSON.parse(readFileSync(join(here, "..", "definitions", id + ".json"), "utf8"));
const task = process.argv.slice(3).join(" ") || "Work toward your goal using the available tools and records.";

// Provider: Anthropic native by default (best Claude fidelity); OpenRouter for any model.
const provider = process.env.PROVIDER || (process.env.OPENROUTER_API_KEY ? "openrouter" : "anthropic");
const run = provider === "openrouter" ? runOpenRouter : runAnthropic;
run(def, task).catch((e: unknown) => { console.error(e); process.exit(1); });
`,
  "package.json": JSON.stringify(
    {
      name: "generated-agents",
      private: true,
      type: "module",
      packageManager: "pnpm@9.12.0",
      engines: { node: ">=20" },
      scripts: { start: "tsx src/runner.ts", typecheck: "tsc --noEmit", lint: "eslint src" },
      dependencies: { "@anthropic-ai/sdk": "^0.110.0", openai: "^4.67.0" },
      devDependencies: { tsx: "^4.19.0", typescript: "^5.6.2", "@types/node": "^20.16.5", eslint: "^9.11.0", "@eslint/js": "^9.11.0", "typescript-eslint": "^8.6.0", globals: "^15.9.0" },
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
  ".env.example": `# Copy to .env. Pick a provider.
PROVIDER=anthropic                         # or: openrouter
SPINE_URL=http://localhost:3000

# Anthropic native (default — best Claude fidelity):
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-5

# OpenRouter — one integration, ANY model (Claude / GPT / Gemini / Llama / self-hosted). Cheapest route
# to a low/flat cost is a small open model here; note: consumer plans (Claude Max, ChatGPT Pro, Gemini
# Advanced) are NOT usable programmatically — their ToS forbid it and there is no official API.
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
`,
  ".gitignore": "node_modules\n.env\n",
};

/** Resolve each agent's toolset and emit a runnable, provider-flexible runtime (definitions + loop). */
export function agentsAdapter(caps: CapabilityDoc, domain: DomainDoc, agents?: AgentsDoc, comms?: CommunicationsDoc): Record<string, string> {
  if (!agents?.agents?.length) return {};
  const evName = new Map((domain.events ?? []).map((e) => [e.id, e.name || e.id]));
  const capName = new Map(caps.capabilities.map((c) => [c.id, c.name || c.id]));
  const defs: AgentDef[] = [];

  for (const a of agents.agents) {
    const agentCaps = new Set(a.capabilities ?? []);
    const ownedEntities = new Set(domain.aggregates.filter((x) => agentCaps.has(x.owner)).map((x) => x.id));
    const tools: AgentTool[] = [];
    for (const c of domain.commands ?? []) {
      if (!ownedEntities.has(c.aggregate)) continue;
      const agg = domain.aggregates.find((x) => x.id === c.aggregate);
      tools.push(commandTool(c, attributeSpecs(agg ?? { attributes: [] }).map((f) => slug(f.name)), evName));
    }
    tools.push({ name: "notify", kind: "notify", description: "Send an email or Slack message to a person or channel — e.g. route to a human for a decision, then continue when they respond.", invoke: { channels: ["email", "slack"], via: "n8n" } });
    for (const cm of comms?.actions ?? []) {
      if (!ownedEntities.has(cm.entity) || cm.channel === "pdf") continue;
      tools.push({ name: slug(cm.id), kind: cm.channel, description: `${cm.name} → ${cm.recipient}`, invoke: { channel: cm.channel, on: cm.on, template: `templates/${cm.id}.md` } });
    }
    defs.push({ id: slug(a.id), name: a.name || a.id, goal: a.goal || "", instructions: a.instructions, model: a.model, effort: a.effort, capabilities: (a.capabilities ?? []).map((c) => capName.get(c) ?? c), tools });
  }

  const files: Record<string, string> = {};
  for (const [rel, content] of Object.entries(RUNTIME)) files[`agents/${rel}`] = content;
  for (const d of defs) files[`agents/definitions/${d.id}.json`] = JSON.stringify(d, null, 2);
  files["agents/README.md"] = `# Agents — a runnable, provider-flexible agent runtime

Goal-driven operators. Each \`definitions/<id>.json\` is a definition the runtime loads: a **goal** and
its **tools** (commands = the spine endpoints the UI/workflows also call; \`notify\` = the human-in-the-
loop router; comm actions = pre-built messages).

\`\`\`bash
pnpm install
# start the spine first (see ../spine), then:
SPINE_URL=http://localhost:3000 ANTHROPIC_API_KEY=sk-ant-... pnpm start ${defs[0]?.id ?? "<agent-id>"} "qualify the newest lead"
\`\`\`

## Augmenting an agent's behaviour
Each \`definitions/<id>.json\` carries the agent's **goal**, **tools**, and (optional) **instructions**
(its system prompt), **model**, and **effort** (thinking level: low|medium|high|max). These come from the
**model** (\`model.json\` → agents) — the source of truth. Edit them there and regenerate; the runtime
applies **per-agent model + thinking + instructions**. (Anthropic honours model + effort; OpenRouter uses
model + instructions.) Which agents exist and which tools they get is derived from their capabilities:
change an agent's capabilities → its command tools change.

## Choosing a model / provider (\`.env\`)
- **Anthropic native** (default): set \`ANTHROPIC_API_KEY\` + \`ANTHROPIC_MODEL\` (per-agent \`model\`/\`effort\`
  in the definition override it). Best Claude fidelity.
- **OpenRouter** (any model): set \`PROVIDER=openrouter\` + \`OPENROUTER_API_KEY\` + \`OPENROUTER_MODEL\`
  (e.g. \`openai/gpt-4o\`, \`google/gemini-2.0-flash\`, \`meta-llama/llama-3.3-70b\`, or a self-hosted model).
  One OpenAI-compatible integration for every provider — the cheapest/most-predictable route is a small
  open model.

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
