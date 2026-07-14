/**
 * polishComponents — an automated UX pass over the generated app's screens. A "senior product designer"
 * agent critiques each entity's view spec against a best-practices rubric (in the chosen design language,
 * Kiln by default) and returns an IMPROVED spec + the rationale for each change. Like generateComponents
 * it emits validated DATA (never JSX), allow-listed to the entity's real fields, so the output is
 * build-safe BY CONSTRUCTION — an invalid spec degrades to the previous/default screen.
 *
 * "Iterate until best practices are met": each entity runs a BOUNDED loop (default 2 rounds) — improve →
 * if the agent reports `done` (or proposes no further change), stop. This is a loop-until-dry with a hard
 * cap, so it converges and stays cheap. The human reviews + accepts/adjusts the result in-app.
 */
import type { CapabilityDoc, DomainDoc, ContextsDoc } from "@kiln/compiler";
import type { LlmProvider } from "./types.ts";
import { projectAppModel, type AppModel } from "@kiln/codegen";
import { PROMPTS } from "./prompts.generated.ts";
import { COMPONENTS_SCHEMA, validateSpec, type ViewSpec } from "./components.ts";

export const POLISH_UI_SYSTEM_PROMPT = PROMPTS["polish-ui"];
/** System prompt for the VISUAL pass — the model is shown a screenshot alongside the spec (Anthropic-only). */
export const POLISH_VISUAL_SYSTEM_PROMPT = PROMPTS["polish-visual"];

// The view-spec schema plus the critique's rationale (`improvements`) and a convergence signal (`done`).
export const POLISH_UI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["columns", "formFields"],
  properties: {
    ...COMPONENTS_SCHEMA.properties,
    improvements: { type: "array", items: { type: "string" } },
    done: { type: "boolean" },
  },
} as const;

type Entity = AppModel["entities"][number];

/** A compact default spec (what the generated app shows with no view spec) — the starting point to critique. */
function defaultSpec(e: Entity): ViewSpec {
  return {
    columns: e.fields.map((f) => ({ field: f.name, format: (f.type === "money" || f.type === "date" || f.type === "boolean" ? f.type : "text") as ViewSpec["columns"][number]["format"] })),
    formFields: e.fields.map((f) => f.name),
  };
}

function renderPolish(e: Entity, commands: string[], current: ViewSpec): string {
  return [
    `# Improve the screen for entity "${e.name}" (id: ${e.id})`,
    `Fields (name:type): ${e.fields.map((f) => `${f.name}:${f.type}`).join(", ") || "(none)"}`,
    commands.length ? `Actions on this screen: ${commands.join(", ")}` : `Actions: (none)`,
    `Current screen spec (JSON) to critique and improve:`,
    JSON.stringify(current),
  ].join("\n");
}

export interface PolishResult {
  views: Record<string, ViewSpec>;
  improvements: Record<string, string[]>;
  provider: string;
  written: number;
  skipped: number;
}

async function polishEntity(
  m: AppModel,
  e: Entity,
  currentViews: Record<string, ViewSpec>,
  provider: LlmProvider,
  rounds: number,
): Promise<{ spec: ViewSpec | null; improvements: string[]; provider: string }> {
  const commands = m.commands.filter((c) => c.entity === e.id).map((c) => c.name);
  let spec: ViewSpec = currentViews[e.id] ?? defaultSpec(e);
  const improvements: string[] = [];
  let name = provider.name;
  for (let round = 0; round < rounds; round++) {
    let raw: Record<string, unknown> | null = null;
    try {
      const res = await provider.complete({ system: POLISH_UI_SYSTEM_PROMPT, user: renderPolish(e, commands, spec), schema: POLISH_UI_SCHEMA, context: m });
      name = res.provider;
      raw = res.json as Record<string, unknown> | null;
    } catch {
      break; // keep whatever we have so far (build-safe)
    }
    const improved = validateSpec(raw, e);
    if (!improved) break;
    const imps = Array.isArray(raw?.improvements) ? (raw!.improvements as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 8) : [];
    spec = improved;
    improvements.push(...imps);
    if (raw?.done === true || imps.length === 0) break; // converged — no further material change
  }
  return { spec, improvements, provider: name };
}

/**
 * Run the UX pass over every entity (concurrent), returning the improved view specs + per-screen rationale.
 * `currentViews` are the specs in play now (from generateComponents or a prior polish); absent → the default.
 */
export async function polishComponents(
  caps: CapabilityDoc,
  domain: DomainDoc,
  contexts: ContextsDoc | undefined,
  currentViews: Record<string, ViewSpec> | undefined,
  provider: LlmProvider,
  opts: { rounds?: number } = {},
): Promise<PolishResult> {
  const rounds = Math.max(1, Math.min(3, opts.rounds ?? 2));
  const m = projectAppModel(caps, domain, contexts);
  const current = currentViews ?? {};
  const results = await Promise.all(m.entities.map((e) => polishEntity(m, e, current, provider, rounds)));
  const views: Record<string, ViewSpec> = {};
  const improvements: Record<string, string[]> = {};
  let skipped = 0;
  m.entities.forEach((e, i) => {
    const r = results[i];
    if (r.spec) {
      views[e.id] = r.spec;
      if (r.improvements.length) improvements[e.id] = r.improvements;
    } else {
      skipped += 1;
    }
  });
  return { views, improvements, provider: results[0]?.provider ?? provider.name, written: Object.keys(views).length, skipped };
}
