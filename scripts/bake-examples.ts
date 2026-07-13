// Bake full models for the description-first gallery examples (legal / coffee / funeral).
//
// Runs each example's narrative through the SAME generation pipeline the app uses — the /api routes on
// the running service, in the same order and threading — then writes the assembled model to
// apps/web/src/data/<id>-model.json (same shape as solar-model.json). projects.ts loads these so the
// examples ship rich out of the box instead of "generate in-app".
//
// Usage: start the service (npm run dev --workspace @kiln/service — it loads the root .env with the key),
// then: node scripts/bake-examples.ts   [SVC=http://localhost:8787]
import { writeFileSync } from "node:fs";
import { legalNarrative, baristaNarrative, funeralNarrative } from "../apps/web/src/data/examples.ts";

const SVC = process.env.SVC || "http://localhost:8787";
const MODEL = "claude-sonnet-5";
const EFFORT = "medium";

async function post(path: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${SVC}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, model: MODEL, effort: EFFORT }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} → ${data.error ?? res.status}`);
  return data;
}

// Mirror App.tsx's generate chain exactly (docs thread the same way the app threads them).
async function bake(narrative: string): Promise<Record<string, unknown>> {
  const capabilities = (await post("/api/generate", { narrative })).doc;
  const domain0 = (await post("/api/domain", { capabilities })).doc;
  const contexts = (await post("/api/contexts", { capabilities })).doc;
  const behaviour = (await post("/api/events", { domain: domain0, capabilities })).doc;
  behaviour.policies = undefined; // fresh commands/events invalidate any prior reactions (App.tsx)
  const flow = (await post("/api/policies", { domain: behaviour, capabilities })).doc; // policies merged
  const roles = (await post("/api/roles", { capabilities })).doc;
  let workflows = (await post("/api/workflows", { domain: behaviour })).doc;
  const orch = await post("/api/orchestration", { workflows, domain: behaviour });
  workflows = orch.workflows ?? workflows; // modes folded onto the workflows (source of truth)
  const agents = (await post("/api/agents", { capabilities })).doc;
  return { capabilities, contexts, domain: flow, roles, workflows, agents };
}

const targets: Array<[string, string]> = [
  ["legal-model.json", legalNarrative],
  ["coffee-model.json", baristaNarrative],
  ["funeral-model.json", funeralNarrative],
];

for (const [file, narrative] of targets) {
  console.log(`baking ${file} …`);
  const model = await bake(narrative);
  const out = new URL(`../apps/web/src/data/${file}`, import.meta.url);
  writeFileSync(out, JSON.stringify(model, null, 2) + "\n");
  const caps = (model.capabilities as any).capabilities.length;
  const ents = (model.domain as any).aggregates.length;
  const wf = (model.workflows as any).workflows.length;
  const ag = (model.agents as any).agents.length;
  console.log(`  ✓ ${file}: ${caps} caps · ${ents} entities · ${wf} workflows · ${ag} agents`);
}
console.log("done.");
