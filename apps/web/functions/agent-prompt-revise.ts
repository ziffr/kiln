import { reviseAgentPrompt, FabricatedToolError, CRITIQUE_EFFORT, type CritiqueFinding, type ReviewModel } from "@kiln/skills";
import type { CapabilityDoc } from "@kiln/compiler";
import { requireClient, readBody, newUsage, estCost, anthropicProvider, modelById, DEFAULT_MODEL, DEFAULT_EFFORT, EFFORTS, type Req, type Res } from "./_lib.ts";

// Apply ONE agent-prompt finding: propose the SMALLEST edit to the agent's authored behaviour that
// addresses it. A PROPOSAL only — the app shows it as a diff and the human accepts or rejects; nothing
// here writes the model (golden invariants #2/#5). Mirrors the service's /api/agent-prompt-revise.
export default async function handler(req: Req, res: Res): Promise<void> {
  const client = requireClient(req, res);
  if (!client) return;
  const body = readBody<{
    agentId?: string;
    capabilities?: CapabilityDoc;
    // The docs needed to derive the agent's contract — the ground truth a revision must stay inside.
    domain?: unknown;
    agents?: unknown;
    workflows?: unknown;
    comms?: unknown;
    services?: unknown;
    findings?: CritiqueFinding[];
    model?: string;
    effort?: string;
    promptOverride?: string;
  }>(req);
  if (!body.agentId || !body.capabilities?.capabilities?.length) return void res.status(400).json({ error: "agentId and capabilities are required" });
  const findings = Array.isArray(body.findings) ? body.findings.filter((f) => f && typeof f.message === "string") : [];
  if (!findings.length) return void res.status(400).json({ error: "at least one finding is required" });
  const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
  // Sized like the critique it acts on ("agent-prompt"), not the light agents stage.
  const wantEffort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : CRITIQUE_EFFORT["agent-prompt"];
  const effort = model.supportsEffort ? wantEffort : DEFAULT_EFFORT;
  const usage = newUsage();
  const provider = anthropicProvider(client, model.id, effort, model.supportsEffort, usage, body.promptOverride);
  const review: ReviewModel = {
    caps: body.capabilities,
    domain: body.domain as never,
    agents: body.agents as never,
    workflows: body.workflows as never,
    comms: body.comms as never,
    services: body.services as never,
    agentId: body.agentId,
  };
  try {
    const result = await reviseAgentPrompt(review, findings, provider);
    const estCostUsd = estCost(usage, model);
    res.status(200).json({ ...result, model: model.id, usage, estCostUsd, sessionSpendUsd: estCostUsd });
  } catch (e) {
    // A revision that (even after the repair retry) names a tool the agent does not have is defective
    // output, not a server fault: 422, and the human is told why nothing is being offered.
    if (e instanceof FabricatedToolError) {
      const estCostUsd = estCost(usage, model); // the attempts were still billed — report them honestly
      return void res.status(422).json({ error: e.message, fabricatedTools: e.tools, model: model.id, usage, estCostUsd, sessionSpendUsd: estCostUsd });
    }
    throw e;
  }
}
export const config = { maxDuration: 60 };
