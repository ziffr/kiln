import Anthropic from "@anthropic-ai/sdk";
import { resolveAgentDefs, buildToolSchemas, toOpenAiMessages, toOpenAiTools, runAgentLoop, type LoopMessage, type LoopTurn, type NextTurn } from "@kiln/codegen";
import { slug } from "@kiln/ir";
import type { AgentsDoc, CapabilityDoc, DomainDoc } from "@kiln/compiler";
import { requireClient, readBody, newUsage, estCost, resolveModel, openrouterCfg, omnirouteCfg, providerLabel, pickEffort, EFFORTS, type Req, type Res } from "./_lib.ts";

/**
 * Test-this-agent (hosted mirror of apps/service /api/agent-run). Runs a bounded agent loop with MOCK
 * tool dispatch (no spine/vendor calls) so the hosted demo can preview how an agent reasons over its
 * tools. Native tool-use runs on the SAME engine configured for generation — Anthropic SDK, or an
 * OpenAI-compatible gateway (OpenRouter / omniroute) resolved from body.provider/model. Anthropic stays
 * the hosted baseline. Returns a light run-trace + cost.
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
    provider?: string;
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
  // No authored behaviour → refuse, as the exported runtime does. Running a contract-derived template would
  // report a pass for an agent nobody designed.
  const system = agent?.instructions?.trim();
  if (!system) return void res.status(400).json({ error: `${agent?.name || body.agentId} has no behaviour yet, so there is no prompt to run. Generate or write HOW it decides on the Agents stage, then test it.` });
  const task = (body.task ?? "").trim() || "Work toward your goal using the available tools and records.";

  // Same engine as generation: resolve {provider,model} from the request. Per-agent effort (gated on support).
  const model = resolveModel(body);
  const wantEffort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : pickEffort(def.effort);
  const effort = model.supportsEffort ? wantEffort : undefined;
  const schemas = buildToolSchemas(def);

  const usage = newUsage();
  let nextTurn: NextTurn;
  let provider: string;
  if (model.provider === "anthropic") {
    provider = providerLabel();
    const tools = schemas.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })) as Anthropic.Tool[];
    nextTurn = async (messages: LoopMessage[]): Promise<LoopTurn> => {
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
  } else {
    const or = openrouterCfg();
    const om = omnirouteCfg();
    const cfg = model.provider === "openrouter" && or ? { ...or, label: "openrouter" } : model.provider === "omniroute" && om ? { ...om, label: "omniroute" } : null;
    if (!cfg) return void res.status(500).json({ error: `engine "${model.provider}" is not configured on the server` });
    provider = cfg.label;
    const url = `${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const tools = toOpenAiTools(schemas);
    nextTurn = async (messages: LoopMessage[]): Promise<LoopTurn> => {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}`, "HTTP-Referer": "https://kilnstudio.app", "X-Title": "Kiln Studio" },
        body: JSON.stringify({
          model: model.id,
          max_tokens: 2048,
          messages: toOpenAiMessages(messages, system),
          tools,
          ...(effort ? { reasoning_effort: effort === "max" ? "high" : effort } : {}),
        }),
      });
      if (!resp.ok) throw new Error(`${cfg.label} request failed (${resp.status}) for model "${model.id}": ${(await resp.text().catch(() => "")).slice(0, 500)}`);
      const data = (await resp.json()) as { choices?: Array<{ message?: { content?: unknown; tool_calls?: Array<{ id: string; function?: { name: string; arguments?: string } }> }; finish_reason?: string }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      const choice = data.choices?.[0];
      const msg = choice?.message ?? {};
      const toolUses = (msg.tool_calls ?? []).map((tc) => {
        let input: Record<string, unknown> = {};
        try { input = JSON.parse(tc.function?.arguments || "{}") as Record<string, unknown>; } catch { input = {}; }
        return { id: tc.id, name: tc.function?.name ?? "", input };
      });
      const text = typeof msg.content === "string" ? msg.content.trim() : "";
      const turnUsage = { input: data.usage?.prompt_tokens ?? 0, output: data.usage?.completion_tokens ?? 0, cacheRead: 0, cacheCreate: 0 };
      const end = choice?.finish_reason !== "tool_calls" && !toolUses.length;
      return { text, toolUses, end, usage: turnUsage, content: msg };
    };
  }

  const run = await runAgentLoop(def, task, nextTurn);
  usage.input = run.usage.input; usage.output = run.usage.output; usage.cacheRead = run.usage.cacheRead; usage.cacheCreate = run.usage.cacheCreate;
  const estCostUsd = estCost(usage, model);
  const outUsage = { input: usage.input, output: usage.output };
  const trace = { system, task, steps: run.steps, finalText: run.finalText, model: model.id, provider, usage: outUsage, estCostUsd, stepCount: run.stepCount, at: Date.now() };
  res.status(200).json({ finalText: run.finalText, trace, usage: outUsage, estCostUsd, model: model.id, provider, sessionSpendUsd: estCostUsd });
}
export const config = { maxDuration: 60 };
