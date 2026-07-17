/**
 * @kiln/codegen/agentSim — an in-Studio "Test this agent" loop with MOCK tool dispatch.
 *
 * This is a preview/test analog of the exported runtime's agent loop (`agents.ts` runAnthropic +
 * executeTool). The real loop shape (12-step cap, tool_use → tool_result feedback) is preserved, but:
 *   - tools are dispatched by `mockDispatch` — a plausible SIMULATED result, NEVER a network call
 *     (the real `executeTool` POSTs the spine / vendor URL; the mock must not), and
 *   - the loop is provider-agnostic: the caller supplies a `NextTurn` that talks to whatever model.
 *
 * Pure + isomorphic (no SDK, no `node:*`), so BOTH the local service (apps/service) and the hosted
 * Vercel function share ONE implementation, and it's unit-testable with a fake `NextTurn` at zero cost.
 */

import { agentToolParams, capReadRows, READ_ROW_CAP, type AgentDef, type AgentTool } from "./agents.ts";

/** One JSON-Schema tool definition, provider-neutral (Anthropic `input_schema` / OpenAI `parameters`). */
export interface ToolSchema {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** Build the tool schemas for an agent — the same shapes the exported runtime would send. */
export function buildToolSchemas(def: AgentDef): ToolSchema[] {
  return def.tools.map((t) => ({ name: t.name, description: t.description, input_schema: agentToolParams(t) }));
}

/**
 * Translate the provider-neutral tool schemas into OpenAI `tools` — `[{type:"function", function:{name,
 * description, parameters}}]`. Pure; mirrors the exported runtime's `runOpenAICompatible` tool shape.
 */
export function toOpenAiTools(schemas: ToolSchema[]): Array<Record<string, unknown>> {
  return schemas.map((s) => ({ type: "function", function: { name: s.name, description: s.description, parameters: s.input_schema } }));
}

/**
 * Translate the loop's Anthropic-ish running history into OpenAI chat-completions messages. Pure +
 * isomorphic so both the local service and the hosted function share it. Rules:
 *   · prepend a `{role:"system", content:system}` turn
 *   · `{role:"user", content:string}` (the task)          → `{role:"user", content}`
 *   · `{role:"assistant", content}`                        → the stored OpenAI assistant message as-is
 *       (the OAI nextTurn stores `turn.content` = the OpenAI `message` object: content + optional tool_calls)
 *   · `{role:"user", content:[{type:"tool_result", …}]}`   → one `{role:"tool", tool_call_id, content}` per result
 */
export function toOpenAiMessages(messages: LoopMessage[], system: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user" && typeof m.content === "string") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "user" && Array.isArray(m.content)) {
      for (const part of m.content as Array<{ type?: string; tool_use_id?: string; content?: unknown }>) {
        if (part && part.type === "tool_result") {
          out.push({ role: "tool", tool_call_id: part.tool_use_id, content: part.content });
        }
      }
    } else if (m.role === "assistant") {
      // The stored OpenAI assistant message object (content + optional tool_calls) — pass through as-is.
      out.push(m.content as Record<string, unknown>);
    }
  }
  return out;
}

/**
 * Does a simulated `find_*` match anything? A deterministic function of the query (djb2 over the canonical
 * filter), so the SAME lookup always simulates the same way — no randomness in a trace — while different
 * lookups exercise both the found and the not-found path. It is a coin-flip, not a claim about real data;
 * the result always carries a `Simulated …` note saying so.
 */
function simulatedHit(query: Record<string, string>): boolean {
  const canonical = Object.keys(query).sort().map((k) => `${k}=${query[k]}`).join("&");
  let h = 5381;
  for (let i = 0; i < canonical.length; i++) h = ((h * 33) ^ canonical.charCodeAt(i)) >>> 0;
  return h % 2 === 0;
}

/**
 * Simulate ONE tool call — a plausible result WITHOUT any network call. Every tool kind (command, notify,
 * email, slack, external, pdf/…) gets a realistic shape so the loop can proceed and the trace reads
 * naturally. The result never leaves the process; the loop flags each step `simulated: true`.
 */
export function mockDispatch(tool: AgentTool, input: Record<string, unknown>): unknown {
  switch (tool.kind) {
    case "read": {
      // A real run GETs the spine; here we hand back a plausible shape so the loop can proceed. `get_*` →
      // one record; `find_*` → the rows matching a field filter; `list_*` → a small record list. Same cap +
      // honest-truncation contract as the real runtime, so what the model sees here matches production.
      const entity = tool.name.replace(/^(list|get|find)_/, "").replace(/_records$|_\d+$/, "");
      const fields = tool.input ?? [];
      if (fields.includes("id")) {
        const id = String(input.id ?? "").trim() || `${entity}-0001`;
        return { status: 200, record: { id }, note: `Simulated ${tool.name} — no spine call was made; a real run returns the record's current fields.` };
      }
      if (fields.length) {
        // find_*: echo the filter back and simulate BOTH branches. "No match" is the interesting answer for
        // the dedup question this tool exists to answer ("is this email already a lead?"), so a mock that
        // always found a record would mislead the agent half the time. The choice is derived from the query
        // itself → the same filter always simulates the same way, so a trace stays reproducible.
        const query: Record<string, string> = {};
        for (const f of fields) {
          const v = input[f];
          if (v !== undefined && v !== null && String(v) !== "") query[f] = String(v);
        }
        const asked = Object.keys(query);
        if (!asked.length)
          return { status: 400, error: `bad query — pass at least one of: ${fields.join(", ")}`, note: `Simulated ${tool.name} — no spine call was made; a real run needs a field value to match on.` };
        const rows = simulatedHit(query) ? [{ id: `${entity}-0001`, ...query }] : [];
        return {
          status: 200,
          query,
          ...capReadRows(rows),
          note: `Simulated ${tool.name} — no spine call was made; a real run returns the ${entity} records matching ${asked.join(" + ")} exactly (at most ${READ_ROW_CAP}).`,
        };
      }
      const rows = [1, 2, 3].map((n) => ({ id: `${entity}-000${n}` }));
      return { status: 200, ...capReadRows(rows), note: `Simulated ${tool.name} — no spine call was made; a real run reads at most ${READ_ROW_CAP} records from the spine.` };
    }
    case "command": {
      const id = String(input.id ?? "").trim() || `${tool.name.replace(/_/g, "-")}-0001`;
      const { id: _id, ...fields } = input;
      return { status: 200, ok: true, id, applied: fields, note: `Simulated ${tool.name} — no spine call was made.` };
    }
    case "notify":
      return { delivered: true, recipient: input.recipient ?? "(unspecified)", subject: input.subject ?? null, note: "Simulated notification — routed to a human in a real run." };
    case "email":
      return { delivered: true, channel: "email", to: input.recipient ?? "(entity contact)", note: "Simulated email — a real run renders + sends the template." };
    case "slack":
      return { posted: true, channel: "slack", note: "Simulated Slack message — a real run posts to the channel." };
    case "external": {
      // NO network call — and say so precisely: a Test-agent run must never read as a real vendor call. The
      // auth line reports what a real run WOULD present (by env var NAME — the value is never read here).
      const credentialEnv = typeof tool.invoke?.credentialEnv === "string" ? tool.invoke.credentialEnv : undefined;
      const scheme = typeof tool.invoke?.auth === "string" ? tool.invoke.auth : "none";
      const auth = credentialEnv && scheme !== "none"
        ? `A real run would authenticate with ${scheme} from ${credentialEnv}; nothing was sent here.`
        : "A real run would call this vendor unauthenticated — no credential is declared.";
      return { accepted: true, invocation: tool.invoke?.invocation ?? "sync", service: tool.invoke?.service ?? tool.name, wouldAuthenticate: Boolean(credentialEnv && scheme !== "none"), note: `Simulated delegation — no external service was called. ${auth}` };
    }
    case "pdf":
      return { rendered: true, note: "Simulated document — a real run renders the PDF." };
    default:
      return { triggered: tool.name, note: "Simulated action." };
  }
}

/** One step of the run trace: an assistant turn's text, OR a (simulated) tool call + its result. */
export interface RunStep {
  assistantText?: string;
  toolCall?: { name: string; input: Record<string, unknown> };
  toolResult?: { output: unknown };
  /** true when a tool was actually resolved + mock-dispatched (never a real call). */
  simulated?: boolean;
}

/** Token usage accumulated across the loop's model turns. */
export interface LoopUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
}

/** What one model turn returned — the caller maps its provider's response into this shape. */
export interface LoopTurn {
  /** assistant text for this turn (may be empty). */
  text: string;
  /** tool calls the assistant made this turn. */
  toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  /** did the assistant end its turn (stop_reason end_turn / no tools)? */
  end: boolean;
  /** token usage for this turn. */
  usage: LoopUsage;
  /** the opaque provider-native assistant content to append to the running message history. */
  content: unknown;
}

/** A message in the running history — role + opaque provider-native content. */
export interface LoopMessage { role: "user" | "assistant"; content: unknown }

/** The caller's model bridge: given the running messages, return the next assistant turn. */
export type NextTurn = (messages: LoopMessage[]) => Promise<LoopTurn>;

export interface AgentRunResult {
  finalText: string;
  steps: RunStep[];
  /** number of model turns taken (bounded by maxSteps). */
  stepCount: number;
  usage: LoopUsage;
}

const zeroUsage = (): LoopUsage => ({ input: 0, output: 0, cacheRead: 0, cacheCreate: 0 });

/**
 * Run the bounded (default 12-step) agent loop: call the model with tools, record its text, dispatch each
 * tool call via the MOCK dispatcher, feed the (simulated) results back, and continue until the model ends
 * its turn, stops calling tools, or the cap is hit. Deterministic given a deterministic `NextTurn`.
 */
export async function runAgentLoop(def: AgentDef, task: string, nextTurn: NextTurn, maxSteps = 12): Promise<AgentRunResult> {
  const messages: LoopMessage[] = [{ role: "user", content: task }];
  const steps: RunStep[] = [];
  const usage = zeroUsage();
  let finalText = "";
  let turns = 0;

  for (let step = 0; step < maxSteps; step++) {
    const turn = await nextTurn(messages);
    turns++;
    usage.input += turn.usage.input;
    usage.output += turn.usage.output;
    usage.cacheRead += turn.usage.cacheRead;
    usage.cacheCreate += turn.usage.cacheCreate;
    if (turn.text) { finalText = turn.text; steps.push({ assistantText: turn.text }); }
    messages.push({ role: "assistant", content: turn.content });
    if (turn.end || !turn.toolUses.length) break;

    const results: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];
    for (const tu of turn.toolUses) {
      const tool = def.tools.find((t) => t.name === tu.name);
      const output = tool ? mockDispatch(tool, tu.input) : { error: `unknown tool ${tu.name}` };
      steps.push({ toolCall: { name: tu.name, input: tu.input }, toolResult: { output }, simulated: Boolean(tool) });
      results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(output) });
    }
    messages.push({ role: "user", content: results });
  }

  return { finalText, steps, stepCount: turns, usage };
}
