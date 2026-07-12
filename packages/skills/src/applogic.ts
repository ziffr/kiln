import { PROMPTS } from "./prompts.generated.ts";
/**
 * generateAppLogic — the LLM writes the business logic for the generated app. For each modelled
 * command it returns a small JS handler body `(input, ctx) => record` with sensible defaults,
 * computed fields and light validation, given the command's entity + typed fields. The deterministic
 * generateApp() wires these in; anything invalid or missing falls back to a generic pass-through.
 */

import type { CapabilityDoc, DomainDoc, ContextsDoc } from "@vbd/compiler";
import type { LlmProvider } from "./types.ts";
import { projectAppModel, type AppModel } from "@vbd/codegen";

// One handler at a time — the fan-out gives each command its own focused agent call.
export const APP_LOGIC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["code"],
  properties: { code: { type: "string", description: "a block-bodied JS arrow function `(input, ctx) => { /* heavily commented */ return { ...record }; }` — inline // comments must explain every decision and why" } },
} as const;

export const APP_LOGIC_SYSTEM_PROMPT = PROMPTS["app-logic"];

function renderOne(m: AppModel, c: AppModel["commands"][number], feedback?: string): string {
  const ent = m.entities.find((e) => e.id === c.entity);
  const fields = (ent?.fields ?? []).map((f) => `${f.name}:${f.type}`).join(", ") || "(no typed fields)";
  const others = m.entities.filter((e) => e.id !== c.entity).map((e) => `${e.id} { ${e.fields.map((f) => f.name).join(", ")} }`).join("; ") || "(none)";
  const lines = [
    `# Write the handler for command "${c.name}" (id: ${c.id})`,
    `Acts on entity: ${c.entity} { ${fields} }${c.emits.length ? ` — emits ${c.emits.join(", ")}` : ""}`,
    `Other entities (for ctx.all/ctx.find lookups): ${others}`,
  ];
  if (feedback) lines.push("", `A reviewer flagged issues to fix in this handler — address them:`, feedback);
  return lines.join("\n");
}

// Dangerous tokens a pure data-transform handler never needs — reject rather than embed them.
const BLOCKED = /\b(require|import|eval|Function|process|globalThis|global|module|fetch|XMLHttpRequest|WebSocket|child_process|__proto__|constructor|prototype)\b/;

/**
 * Structurally vet an LLM-written handler WITHOUT executing it (this runs on our server — we must
 * never eval model output). Accepts only an arrow-function-shaped, bracket-balanced snippet free of
 * dangerous tokens. The code is embedded into the file the USER downloads and runs on their machine;
 * the generated server also wraps every handler call in try/catch, so a runtime error can't crash it.
 */
function validateHandler(code: string): string | null {
  const c = code.trim();
  if (!c || c.length > 8000) return null; // room for heavily-commented, block-bodied handlers
  if (!/^\(?[\w\s,{}[\].=]*\)?\s*=>/.test(c)) return null; // must start like `(input, ctx) =>`
  // Run the safety checks on the code with COMMENTS STRIPPED — a prose comment ("// don't fetch here",
  // "// see note (a") must not trip the blocked-token or bracket-balance guards. We return the ORIGINAL
  // (commented) source; only the checks see the stripped version.
  const stripped = c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (BLOCKED.test(stripped)) return null;
  let bal = 0;
  for (const ch of stripped) {
    if (ch === "(" || ch === "{" || ch === "[") bal++;
    else if (ch === ")" || ch === "}" || ch === "]") bal--;
    if (bal < 0) return null;
  }
  return bal === 0 ? c : null;
}

export interface AppLogicResult {
  handlers: Record<string, string>; // command id → validated handler source
  provider: string;
  written: number;
  skipped: number;
}

/**
 * Fan out one focused agent call per command (concurrent). Each writes just that command's handler,
 * given its entity + fields — better than one call for all: parallel, and each stays on-task. Pass
 * `feedback` (e.g. code-review findings) to regenerate handlers that address them — the fix loop.
 */
export async function generateAppLogic(
  caps: CapabilityDoc,
  domain: DomainDoc,
  contexts: ContextsDoc | undefined,
  provider: LlmProvider,
  feedback?: string,
): Promise<AppLogicResult> {
  const m = projectAppModel(caps, domain, contexts);
  const results = await Promise.all(
    m.commands.map(async (c) => {
      try {
        const res = await provider.complete({ system: APP_LOGIC_SYSTEM_PROMPT, user: renderOne(m, c, feedback), schema: APP_LOGIC_SCHEMA, context: m });
        const obj = (res.json && typeof res.json === "object" ? res.json : {}) as Record<string, unknown>;
        const code = typeof obj.code === "string" ? validateHandler(obj.code) : null;
        return { id: c.id, code, provider: res.provider };
      } catch {
        return { id: c.id, code: null, provider: provider.name };
      }
    }),
  );
  const handlers: Record<string, string> = {};
  let skipped = 0;
  for (const r of results) {
    if (r.code) handlers[r.id] = r.code;
    else skipped += 1;
  }
  return { handlers, provider: results[0]?.provider ?? provider.name, written: Object.keys(handlers).length, skipped };
}
