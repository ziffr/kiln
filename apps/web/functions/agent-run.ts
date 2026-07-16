import Anthropic from "@anthropic-ai/sdk";
import { resolveAgentDefs, defaultPlaybook, buildToolSchemas, runAgentLoop, type LoopMessage, type LoopTurn } from "@kiln/codegen";
import { slug } from "@kiln/ir";
import type { AgentsDoc, CapabilityDoc, DomainDoc } from "@kiln/compiler";
import { requireClient, readBody, newUsage, estCost, anthropicModel, providerLabel, pickEffort, type Req, type Res } from "./_lib.ts";

/**
 * Test-this-agent (hosted mirror of apps/service /api/agent-run). Runs a bounded agent loop with MOCK
 * tool dispatch (no spine/vendor calls) so the hosted demo can preview how an agent reasons over its
 * tools. Native tool-use → Anthropic engine, like coach/enrich-web. Returns a light run-trace + cost.
 */
export default async function handler(req: Req, res: Res): Promise<void> {
  const client = requireClient(req, res);
  if (!client) return;
  const body = readBody<{
    agentsDoc?: AgentsDoc;
    agentId?: string;
    task?: string;
    capabilities?: CapabilityDoc;
    domain?: DomainDoc;
    comms?: unknown;
    workflows?: unknown;
    services?: unknown;
    model?: string;
    effort?: string;
  }>(req);
  if (!body.agentsDoc?.agents?.length || !body.agentId) return void res.status(400).json({ error: "agentsDoc and agentId are required" });
  if (!body.capabilities?.capabilities?.length || !body.domain?.aggregates?.length) return void res.status(400).json({ error: "capabilities and a domain model are required (to resolve the agent's tools)" });

  const defs = resolveAgentDefs(body.capabilities, body.domain, body.agentsDoc, body.comms as never, body.workflows as never, body.services as never);
  const wantId = slug(body.agentId);
  const def = defs.find((d) => d.id === wantId);
  if (!def) return void res.status(404).json({ error: `unknown agent ${body.agentId}` });
  const agent = body.agentsDoc.agents.find((a) => slug(a.id) === wantId);
  const system = agent?.instructions?.trim() ? agent.instructions.trim() : defaultPlaybook(def);
  const task = (body.task ?? "").trim() || "Work toward your goal using the available tools and records.";

  const model = anthropicModel(body.model);
  const wantEffort = pickEffort(body.effort ?? def.effort);
  const effort = model.supportsEffort ? wantEffort : undefined;
  const tools = buildToolSchemas(def).map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })) as Anthropic.Tool[];

  const usage = newUsage();
  const nextTurn = async (messages: LoopMessage[]): Promise<LoopTurn> => {
    const resp = await client.messages.create({
      model: model.id,
      max_tokens: 2048,
      system,
      tools,
      messages: messages as Anthropic.MessageParam[],
      ...(effort ? { thinking: { type: "adaptive" as const }, output_config: { effort } } : {}),
    } as unknown as Anthropic.MessageCreateParamsNonStreaming);
    const u = resp.usage;
    const turnUsage = { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheCreate: u.cache_creation_input_tokens ?? 0 };
    const text = resp.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("").trim();
    const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> }));
    return { text, toolUses, end: resp.stop_reason === "end_turn", usage: turnUsage, content: resp.content };
  };

  const run = await runAgentLoop(def, task, nextTurn);
  usage.input = run.usage.input; usage.output = run.usage.output; usage.cacheRead = run.usage.cacheRead; usage.cacheCreate = run.usage.cacheCreate;
  const estCostUsd = estCost(usage, model);
  const provider = providerLabel();
  const outUsage = { input: usage.input, output: usage.output };
  const trace = { system, task, steps: run.steps, finalText: run.finalText, model: model.id, provider, usage: outUsage, estCostUsd, stepCount: run.stepCount, at: Date.now() };
  res.status(200).json({ finalText: run.finalText, trace, usage: outUsage, estCostUsd, model: model.id, provider, sessionSpendUsd: estCostUsd });
}
export const config = { maxDuration: 60 };
