/**
 * @kiln/codegen/managedAgents — the ANTHROPIC MANAGED AGENTS runtime generator (the string-emitting half
 * of the engine; kept OUT of engines/ so that dir stays free of `node:*`). Provisions the model's agents
 * as FIRST-PARTY Managed Agents (create a versioned Agent, run it in Sessions on Anthropic's
 * orchestration + hosted container) — an alternative to the Node runtime / Langdock. Best Claude fidelity.
 *
 * Managed Agents run the loop themselves, so a command becomes a real CUSTOM TOOL: the agent emits
 * `agent.custom_tool_use`, the generated run.mjs executes the spine call host-side (keeps spine auth off
 * the sandbox — Managed-Agents client pattern) and returns the result. Pure + isomorphic string builder.
 */
import { slug } from "@kiln/ir";
import { attributeSpecs, type CapabilityDoc, type DomainDoc, type AgentsDoc } from "@kiln/compiler";

const CREATE_VERB = /^(create|add|register|open|new|capture|issue|request|submit|plan|record)_/;

/** The agent's system prompt: the authored playbook, else a generic one (goal + how-it-works + guardrails).
 *  No API section needed — commands are wired as custom tools below. */
function playbook(a: { name?: string; id: string; goal?: string; instructions?: string; capabilities?: string[] }, capNames: string[]): string {
  if (a.instructions?.trim()) return a.instructions.trim();
  return [
    `# ${a.name || a.id}`,
    "",
    `**Goal.** ${a.goal || `Operate the ${capNames.join(", ")} capabilities.`}`,
    "",
    "## How you work",
    "Work toward the goal with your tools (each tool is a business command). For each item: read the",
    "relevant record, decide, then call the right command. Take one action at a time and check the result",
    "before the next. When a decision needs human judgement, stop and say so rather than guessing.",
    "",
    "## Guardrails",
    "- Never fabricate data; use only what the records and tools give you.",
    "- Prefer the smallest correct action; don't take irreversible steps without cause.",
    "- Stay within your goal and capabilities.",
  ].join("\n");
}

/** Build the Managed Agents provisioning bundle from the model's agents. Returns a `managed-agents/…` map. */
export function managedAgentsAdapter(caps: CapabilityDoc, domain: DomainDoc, agentsDoc?: AgentsDoc): Record<string, string> {
  const files: Record<string, string> = {};
  const agents = agentsDoc?.agents ?? [];
  if (!agents.length) return files;

  const capName = new Map(caps.capabilities.map((c) => [c.id, c.name || c.id]));
  // tool name → the spine endpoint the run.mjs POSTs when the agent calls it (host-side execution).
  const endpoints: Record<string, { method: string; url: string }> = {};
  const specs: Array<{ id: string; name: string }> = [];

  for (const a of agents) {
    const id = slug(a.id);
    const ownedEntities = new Set(domain.aggregates.filter((x) => (a.capabilities ?? []).includes(x.owner)).map((x) => x.id));
    const tools: Array<Record<string, unknown>> = [{ type: "agent_toolset_20260401" }];
    for (const c of domain.commands ?? []) {
      if (!ownedEntities.has(c.aggregate)) continue;
      const res = `${slug(c.aggregate)}s`;
      const action = slug(c.name || c.id);
      const create = CREATE_VERB.test(`${action}_`);
      const toolName = slug(c.id);
      const agg = domain.aggregates.find((x) => x.id === c.aggregate);
      const fields = attributeSpecs(agg ?? { attributes: [] }).map((f) => slug(f.name));
      const properties: Record<string, { type: string }> = create ? {} : { id: { type: "string" } };
      for (const f of fields) properties[f] = { type: "string" };
      tools.push({
        type: "custom",
        name: toolName,
        description: `${c.name || c.id} (on ${c.aggregate})`,
        input_schema: { type: "object", properties },
      });
      endpoints[toolName] = { method: "POST", url: create ? `/${res}` : `/${res}/{id}/${action}` };
    }
    const spec = {
      name: a.name || a.id,
      model: a.model || "claude-sonnet-5",
      system: playbook(a, (a.capabilities ?? []).map((c) => capName.get(c) ?? c)),
      tools,
      metadata: { kilnAgentId: a.id },
    };
    files[`managed-agents/agents/${id}.agent.json`] = JSON.stringify(spec, null, 2);
    specs.push({ id, name: a.name || a.id });
  }

  files["managed-agents/commands.json"] = JSON.stringify(endpoints, null, 2);
  files["managed-agents/provision.sh"] = PROVISION;
  files["managed-agents/run.mjs"] = RUN;
  files["managed-agents/.env.example"] = ENV_EXAMPLE;
  files["managed-agents/README.md"] = readme(specs);
  return files;
}

const PROVISION = `#!/usr/bin/env bash
# Control plane (run ONCE): create a shared environment + one versioned agent per spec, recording ids into
# agents.lock.env. Needs the Anthropic CLI (github.com/anthropics/anthropic-cli) + credentials
# (ANTHROPIC_API_KEY or \`ant auth login\`). Managed Agents is beta; \`ant beta:*\` sets the header for you.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"

ENV_ID=$(ant beta:environments create --transform id -r <<'YAML'
name: kiln-agents
config:
  type: cloud
  networking:
    type: unrestricted
YAML
)
echo "environment: $ENV_ID"
: > "$here/agents.lock.env"
echo "ENV_ID=$ENV_ID" >> "$here/agents.lock.env"
for f in "$here"/agents/*.agent.json; do
  key=$(basename "$f" .agent.json)
  AGENT_ID=$(ant beta:agents create --transform id -r < "$f")
  echo "$key=$AGENT_ID" >> "$here/agents.lock.env"
  echo "agent $key -> $AGENT_ID"
done
echo "wrote agents.lock.env -- run:  node run.mjs <agent-key> \\"<task>\\""
`;

const RUN = `// Data plane (every run): start a Session for a provisioned agent, stream it, and execute its command
// tool-calls against the spine HOST-SIDE (the sandbox never sees SPINE auth). Needs @anthropic-ai/sdk +
// credentials.  node run.mjs <agent-key> "qualify the newest lead"
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(readFileSync(join(here, "agents.lock.env"), "utf8").trim().split("\\n").map((l) => l.split("=")));
const commands = JSON.parse(readFileSync(join(here, "commands.json"), "utf8"));
const [agentKey, ...taskParts] = process.argv.slice(2);
const agentId = env[agentKey], envId = env.ENV_ID;
if (!agentId || !envId) { console.error("provision first (./provision.sh); usage: node run.mjs <agent-key> <task...>"); process.exit(1); }

const SPINE = process.env.SPINE_URL || "http://localhost:3000";
const API_TOKEN = process.env.API_TOKEN; // if the spine requires auth, send the same bearer token
const client = new Anthropic();

const session = await client.beta.sessions.create({ agent: agentId, environment_id: envId, title: agentKey });
console.log("session " + session.id + "  https://platform.claude.com/workspaces/default/sessions/" + session.id);
const stream = await client.beta.sessions.events.stream(session.id);
await client.beta.sessions.events.send(session.id, { events: [{ type: "user.message", content: [{ type: "text", text: taskParts.join(" ") || "Work toward your goal using the available tools and records." }] }] });

for await (const ev of stream) {
  if (ev.type === "agent.message") { for (const b of ev.content) if (b.type === "text") process.stdout.write(b.text); }
  else if (ev.type === "agent.custom_tool_use") {
    const ep = commands[ev.name];
    let out;
    if (!ep) out = { error: "unknown command " + ev.name };
    else {
      const input = ev.input ?? {};
      const url = SPINE + ep.url.replace("{id}", encodeURIComponent(String(input.id ?? "")));
      const headers = { "content-type": "application/json" };
      if (API_TOKEN) headers.authorization = "Bearer " + API_TOKEN;
      const res = await fetch(url, { method: ep.method, headers, body: JSON.stringify(input) });
      out = { status: res.status, body: await res.json().catch(() => ({})) };
    }
    await client.beta.sessions.events.send(session.id, { events: [{ type: "user.custom_tool_result", custom_tool_use_id: ev.id, content: [{ type: "text", text: JSON.stringify(out) }] }] });
  } else if (ev.type === "session.status_terminated") break;
  else if (ev.type === "session.status_idle" && ev.stop_reason?.type !== "requires_action") break;
}
`;

const ENV_EXAMPLE = `# Managed Agents run on Anthropic's orchestration (agent loop) + a hosted container (tools).
ANTHROPIC_API_KEY=sk-ant-...
# SPINE_URL=http://localhost:3000   # the command API the agents operate (called host-side by run.mjs)
# API_TOKEN=change-me               # if the spine requires auth, the same bearer token
`;

function readme(specs: Array<{ id: string; name: string }>): string {
  return `# Agents on Anthropic Managed Agents

An **alternative agent runtime** to the Node runtime in \`../agents\` and to Langdock: run the same agents as
first-party **Managed Agents** — Anthropic runs the agent loop and hosts the tool-execution container; you
create a versioned Agent once and start a Session per task. Best Claude fidelity. Scoped to agents;
workflows stay on n8n.

## The mandatory flow: Agent (once) -> Session (every run)
- \`agents/<id>.agent.json\` — one **Agent Create** payload per agent (name, model, system = its playbook,
  tools = the built-in toolset + one **custom tool per command** it owns).
- \`commands.json\` — the tool -> spine-endpoint map \`run.mjs\` uses to execute command calls host-side.
- \`provision.sh\` — control plane: create a shared environment + each agent via the \`ant\` CLI -> \`agents.lock.env\`.
- \`run.mjs\` — data plane: start a session, stream it, and POST the spine when the agent calls a command
  (keeping the spine's auth off the sandbox — the standard Managed-Agents custom-tool pattern).

## Run
\`\`\`bash
cp .env.example .env          # set ANTHROPIC_API_KEY (or: ant auth login)
./provision.sh                # -> agents.lock.env (needs the \`ant\` CLI)
node run.mjs ${specs[0]?.id ?? "<agent-key>"} "qualify the newest lead"
\`\`\`
Watch it live in the Console (the run prints the session URL). To change an agent, edit its
\`.agent.json\` and re-provision — each update is a new agent version.

## Agents
${specs.map((s) => `- **${s.name}** (\`${s.id}\`)`).join("\n")}
`;
}
