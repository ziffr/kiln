/**
 * @kiln/codegen/langdock — the LANGDOCK agent-runtime generator (the string-emitting half of the engine;
 * kept OUT of engines/ so the engines dir stays free of `node:*` even inside emitted script text — the
 * same split n8nAdapter/agentsAdapter use). Provisions the model's agents into a governed Langdock
 * workspace via its Agent API (create → chat/completions) as an ALTERNATIVE to the Node agents runtime.
 * Scoped to agents; NOT a workflow-codegen target (n8n owns react/sequence). Pure + isomorphic: the
 * scripts it EMITS run node, but this emitter is a pure string builder.
 */
import { slug } from "@kiln/ir";
import { attributeSpecs, type CapabilityDoc, type DomainDoc, type AgentsDoc } from "@kiln/compiler";

const CREATE_VERB = /^(create|add|register|open|new|capture|issue|request|submit|plan|record)_/;

/** The command endpoints an agent operates (mirrors the spine's routes) — told to the agent so it knows its API. */
function commandLines(domain: DomainDoc, ownedEntities: Set<string>): string[] {
  const lines: string[] = [];
  for (const c of domain.commands ?? []) {
    if (!ownedEntities.has(c.aggregate)) continue;
    const res = `${slug(c.aggregate)}s`;
    const action = slug(c.name || c.id);
    const create = CREATE_VERB.test(`${action}_`);
    const url = `{SPINE_URL}${create ? `/${res}` : `/${res}/{id}/${action}`}`;
    lines.push(`- \`POST ${url}\` — ${c.name || c.id} (on ${c.aggregate})`);
  }
  return lines;
}

/** The instructions (system prompt) for a Langdock agent: the authored playbook, else a generic one, plus its API. */
function agentInstructions(
  caps: CapabilityDoc,
  domain: DomainDoc,
  a: { name?: string; id: string; goal?: string; instructions?: string; capabilities?: string[] },
  ownedEntities: Set<string>,
): string {
  const capNames = (a.capabilities ?? []).map((c) => caps.capabilities.find((x) => x.id === c)?.name ?? c);
  const cmds = commandLines(domain, ownedEntities);
  const head = a.instructions?.trim()
    ? a.instructions.trim()
    : [
        `# ${a.name || a.id}`,
        "",
        `**Goal.** ${a.goal || `Operate the ${capNames.join(", ")} capabilities.`}`,
        "",
        "## How you work",
        "Work toward the goal with your API. For each item: read the relevant record, decide, then act via",
        "the right command. Take one action at a time and check the result. When a decision needs human",
        "judgement, escalate rather than guess. Never fabricate data; stay within your goal and capabilities.",
      ].join("\n");
  return [
    head,
    "",
    "## Your API (the commands you operate)",
    "Call these HTTP endpoints (the same command API the app's UI and workflows use). `{SPINE_URL}` and any",
    "auth are provided by the runtime; substitute `{id}` with the record id.",
    ...(cmds.length ? cmds : ["- (no commands — this agent has no owned entities)"]),
    "",
  ].join("\n");
}

/** Build the Langdock provisioning bundle from the model's agents. Returns a `langdock/…` file map. */
export function langdockAdapter(caps: CapabilityDoc, domain: DomainDoc, agentsDoc?: AgentsDoc): Record<string, string> {
  const files: Record<string, string> = {};
  const agents = agentsDoc?.agents ?? [];
  if (!agents.length) return files;

  const specs: Array<{ id: string; name: string }> = [];
  for (const a of agents) {
    const id = slug(a.id);
    const ownedEntities = new Set(domain.aggregates.filter((x) => (a.capabilities ?? []).includes(x.owner)).map((x) => x.id));
    // Knowledge = the entities this agent works on + their fields (grounds the agent in its data).
    const knowledge = domain.aggregates
      .filter((x) => ownedEntities.has(x.id))
      .map((x) => `## ${x.name || x.id}\n${attributeSpecs(x).map((f) => `- ${f.name}: ${f.type}`).join("\n") || "- (no attributes)"}`)
      .join("\n\n");
    // The Langdock Agent Create payload (POST /agent/v1/create). Field names per the Agent Create API —
    // verify against docs.langdock.com if the workspace rejects one; the shape below is the documented core.
    const spec = {
      name: a.name || a.id,
      model: a.model || "claude-sonnet-5",
      instructions: agentInstructions(caps, domain, a, ownedEntities),
      knowledge: knowledge || undefined,
      metadata: { kilnAgentId: a.id, capabilities: a.capabilities ?? [] },
    };
    files[`langdock/agents/${id}.json`] = JSON.stringify(spec, null, 2);
    specs.push({ id, name: a.name || a.id });
  }

  files["langdock/provision.mjs"] = PROVISION;
  files["langdock/invoke.mjs"] = INVOKE;
  files["langdock/.env.example"] = ENV_EXAMPLE;
  files["langdock/README.md"] = readme(specs);
  return files;
}

const PROVISION = `// Provision this model's agents into your Langdock workspace (POST /agent/v1/create), then record the
// returned agent ids into agents.lock.json. Re-run to (re)create; edit agents/<id>.json to change one.
//   LANGDOCK_API_KEY=... node provision.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const KEY = process.env.LANGDOCK_API_KEY;
const BASE = process.env.LANGDOCK_BASE_URL || "https://api.langdock.com";
if (!KEY) { console.error("Set LANGDOCK_API_KEY"); process.exit(1); }

const lock = {};
for (const file of readdirSync(join(here, "agents")).filter((f) => f.endsWith(".json"))) {
  const spec = JSON.parse(readFileSync(join(here, "agents", file), "utf8"));
  const res = await fetch(BASE + "/agent/v1/create", {
    method: "POST",
    headers: { authorization: "Bearer " + KEY, "content-type": "application/json" },
    body: JSON.stringify(spec),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { console.error("x " + spec.name + ": " + res.status + " " + JSON.stringify(body)); continue; }
  const agentId = body.id || body.agentId || body.agent_id;
  lock[file.replace(/\\.json$/, "")] = { agentId, name: spec.name };
  console.log("ok " + spec.name + " -> " + agentId);
}
writeFileSync(join(here, "agents.lock.json"), JSON.stringify(lock, null, 2));
console.log("wrote agents.lock.json - invoke with:  node invoke.mjs <agent-key> \\"<task>\\"");
`;

const INVOKE = `// Wake a provisioned agent (POST /agent/v1/chat/completions). The agent runs in YOUR Langdock workspace.
//   LANGDOCK_API_KEY=... node invoke.mjs <agent-key> "qualify the newest lead"
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const KEY = process.env.LANGDOCK_API_KEY;
const BASE = process.env.LANGDOCK_BASE_URL || "https://api.langdock.com";
const [agentKey, ...taskParts] = process.argv.slice(2);
if (!KEY || !agentKey) { console.error("usage: LANGDOCK_API_KEY=... node invoke.mjs <agent-key> <task...>"); process.exit(1); }

const lock = JSON.parse(readFileSync(join(here, "agents.lock.json"), "utf8"));
const agentId = lock[agentKey]?.agentId;
if (!agentId) { console.error("unknown agent-key " + agentKey + " (see agents.lock.json)"); process.exit(1); }

const res = await fetch(BASE + "/agent/v1/chat/completions", {
  method: "POST",
  headers: { authorization: "Bearer " + KEY, "content-type": "application/json" },
  body: JSON.stringify({ agentId, messages: [{ role: "user", parts: [{ type: "text", text: taskParts.join(" ") }] }] }),
});
console.log(JSON.stringify(await res.json(), null, 2));
`;

const ENV_EXAMPLE = `# Provision + invoke agents in your Langdock workspace.
LANGDOCK_API_KEY=            # a workspace API key with the AGENT_API scope
# LANGDOCK_BASE_URL=https://api.langdock.com   # or your dedicated deployment
# SPINE_URL=http://localhost:3000              # the command API the agents operate (substituted into instructions at run time)
`;

function readme(specs: Array<{ id: string; name: string }>): string {
  return `# Agents on Langdock - run your Kiln agents in a governed workspace

This is an **alternative agent runtime** to the generated Node runtime in \`../agents\` (Anthropic/OpenRouter).
Same agents - but instead of a container you run, they live in **your Langdock workspace**: EU-resident,
audited, governed, with a shared model gateway. Scoped to agents only; **workflows stay on n8n** (Langdock
workflows are a visual builder with no importable definition, so they aren't a codegen target).

## What's here
- \`agents/<id>.json\` - one Langdock **Agent Create** payload per agent (name, model, instructions =
  the agent's playbook + its command API, knowledge = the entities it works on).
- \`provision.mjs\` - creates each agent in your workspace (POST \`/agent/v1/create\`) -> \`agents.lock.json\`.
- \`invoke.mjs\` - wakes one (POST \`/agent/v1/chat/completions\`).

## Run
\`\`\`bash
cp .env.example .env    # set LANGDOCK_API_KEY (AGENT_API scope)
node provision.mjs      # -> agents.lock.json
node invoke.mjs ${specs[0]?.id ?? "<agent-key>"} "qualify the newest lead"
\`\`\`

## Wiring the agents to your command API
The instructions tell each agent its command endpoints (\`{SPINE_URL}/...\`), the same API the UI and n8n use.
Letting the agent actually *call* them is the integration step: expose the spine to Langdock as **custom
tools** (your orchestrator executes the call and returns the result over the session) or via an **MCP
server** in front of the spine, then attach it to the agent. Until then the agent reasons about the API
but you execute the calls. See docs.langdock.com -> Agents / Integrations.

## Agents
${specs.map((s) => `- **${s.name}** (\`${s.id}\`)`).join("\n")}
`;
}
