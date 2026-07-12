/**
 * @vbd/codegen/agents — wire agents to concrete TOOLS and emit a RUNNABLE agent runtime.
 *
 * An agent (SPEC-008) is a goal + the capabilities it operates. This resolves, per agent, the tools it
 * can use — commands (the spine endpoints), a `notify` tool (the human-in-the-loop router), and the
 * pre-built comm actions — and emits a small TypeScript runtime that runs the agent loop against them
 * with the official @anthropic-ai/sdk. Commands are the universal action surface — the UI clicks them,
 * workflows sequence them, agents choose them. Pure and isomorphic (emits code as strings).
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

const RUNTIME: Record<string, string> = {
  "src/def.ts": `export type AgentToolKind = "command" | "notify" | "email" | "slack" | "pdf";
export interface AgentTool { name: string; kind: AgentToolKind; description: string; invoke: Record<string, unknown>; input?: string[]; }
export interface AgentDef { id: string; name: string; goal: string; capabilities: string[]; tools: AgentTool[]; }
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
  "src/runner.ts": `import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { executeTool } from "./tools";
import type { AgentDef, AgentTool } from "./def";

const here = dirname(fileURLToPath(import.meta.url));
const id = process.argv[2];
if (!id) { console.error("usage: pnpm start <agent-id> [task…]  (agent ids: see definitions/)"); process.exit(1); }
const def: AgentDef = JSON.parse(readFileSync(join(here, "..", "definitions", id + ".json"), "utf8"));
const task = process.argv.slice(3).join(" ") || "Work toward your goal using the available tools and records.";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY
const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5"; // configurable

function inputSchema(t: AgentTool): Anthropic.Tool.InputSchema {
  if (t.kind === "command") {
    const properties: Record<string, { type: string }> = { id: { type: "string" } };
    for (const f of t.input ?? []) properties[f] = { type: "string" };
    return { type: "object", properties };
  }
  if (t.kind === "notify") return { type: "object", properties: { recipient: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["recipient", "body"] };
  return { type: "object", properties: {} };
}

async function main(): Promise<void> {
  const tools: Anthropic.Tool[] = def.tools.map((t) => ({ name: t.name, description: t.description, input_schema: inputSchema(t) }));
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: task }];
  const system = "You are " + def.name + ". Goal: " + def.goal + "\\nUse the tools to accomplish the task; call one at a time and stop when done. Then summarize what you did.";
  for (let step = 0; step < 12; step++) {
    const res = await client.messages.create({ model, max_tokens: 1024, system, tools, messages });
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

main().catch((e: unknown) => { console.error(e); process.exit(1); });
`,
  "package.json": JSON.stringify(
    {
      name: "generated-agents",
      private: true,
      type: "module",
      packageManager: "pnpm@9.12.0",
      engines: { node: ">=20" },
      scripts: { start: "tsx src/runner.ts", typecheck: "tsc --noEmit", lint: "eslint src" },
      dependencies: { "@anthropic-ai/sdk": "^0.110.0" },
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
  ".env.example": "# Copy to .env\nANTHROPIC_API_KEY=sk-ant-...\nSPINE_URL=http://localhost:3000\nANTHROPIC_MODEL=claude-sonnet-5\n",
  ".gitignore": "node_modules\n.env\n",
};

/** Resolve each agent's toolset and emit a runnable runtime (definitions + loop). */
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
    defs.push({ id: slug(a.id), name: a.name || a.id, goal: a.goal || "", capabilities: (a.capabilities ?? []).map((c) => capName.get(c) ?? c), tools });
  }

  const files: Record<string, string> = {};
  for (const [rel, content] of Object.entries(RUNTIME)) files[`agents/${rel}`] = content;
  for (const d of defs) files[`agents/definitions/${d.id}.json`] = JSON.stringify(d, null, 2);
  files["agents/README.md"] = `# Agents — a runnable agent runtime

Goal-driven operators. Each \`definitions/<id>.json\` is a definition the runtime loads: a **goal** and
its **tools** (commands = the spine endpoints the UI/workflows also call; \`notify\` = the human-in-the-
loop router; comm actions = pre-built messages).

\`\`\`bash
pnpm install
# start the spine first (see ../spine), then:
SPINE_URL=http://localhost:3000 ANTHROPIC_API_KEY=sk-ant-... pnpm start ${defs[0]?.id ?? "<agent-id>"} "qualify the newest lead"
\`\`\`

The loop (\`src/runner.ts\`, official @anthropic-ai/sdk) gives the LLM the goal + tools and executes each
tool call (\`src/tools.ts\`): command tools POST the spine (which persists + emits events); \`notify\`/comm
tools call your integration (logged by default — wire them up). Agent-vs-workflow: an **agent** when the
path is open-ended/judgement-heavy; a **workflow** when the steps are fixed.
`;
  return files;
}
