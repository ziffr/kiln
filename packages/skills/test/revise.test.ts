/**
 * revise.test.ts — the agent-prompt revise skill (propose a MINIMAL edit addressing a finding).
 *
 * The two things that must hold, because a human accepts the result:
 *   1. the request is well-formed + DATA-wrapped (the prompt under edit is the most instruction-shaped
 *      untrusted text in the product — it IS a prompt), and carries the derived contract as ground truth;
 *   2. a revision can never introduce a tool the agent does not have (golden invariant #6), enforced in
 *      code rather than merely asked for in the prompt.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reviseAgentPrompt,
  buildReviseRequest,
  reviseSystemPrompt,
  currentPrompt,
  contractVocabulary,
  fabricatedTools,
  toolMentions,
  revisionId,
  FabricatedToolError,
  type CritiqueFinding,
  type LlmProvider,
  type ReviewModel,
} from "../src/index.ts";
import { resolveReviewAgent } from "../src/critic.ts";
import type { CapabilityDoc } from "@kiln/compiler";

const caps: CapabilityDoc = {
  version: "0.2",
  domain: "solar",
  capabilities: [
    { id: "lead_management", name: "Lead Management" },
    { id: "billing", name: "Billing" },
  ],
};

const PROMPT = "You qualify leads. Use the `qualify_lead` tool, then hand off.";

/** One agent owning a Lead entity + a qualify command emitting an event → a real derived contract. */
const agentModel: ReviewModel = {
  caps,
  agentId: "lead_triage",
  domain: {
    aggregates: [{ id: "lead", name: "Lead", owner: "lead_management", attributes: [{ name: "score", type: "number" }, { name: "contact_email", type: "text" }] }],
    commands: [{ id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", capability: "lead_management", emits: ["lead_qualified"] }],
    events: [{ id: "lead_qualified", name: "LeadQualified", aggregate: "lead" }],
    policies: [],
  },
  agents: { version: "0.1", agents: [{ id: "lead_triage", name: "Lead Triage", goal: "qualify and route inbound leads", capabilities: ["lead_management"], instructions: PROMPT }] },
} as any;

const finding = (message: string, suggestion?: string): CritiqueFinding => ({ id: "f1", severity: "concern", message, suggestion, target: "lead_triage" });

const provider = (revised: string, note = "n"): LlmProvider & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    name: "t",
    complete: async (req) => {
      calls.push(req.user);
      return { provider: "t", raw: "", json: { revised, note } };
    },
  } as LlmProvider & { calls: string[] };
};

const contractOf = (m: ReviewModel) => resolveReviewAgent(m)!.contract;

// ── the request ───────────────────────────────────────────────────────────────────────────────────

test("the revise request is well-formed: contract as ground truth, findings, and the prompt as DATA", () => {
  const req = buildReviseRequest(agentModel, [finding("no escalation path", "escalate ambiguous leads to a human")]);
  // the agent + its DERIVED contract (the ground truth a revision must stay inside)
  assert.match(req.user, /Lead Triage/);
  assert.match(req.user, /qualify_lead/, "its real tool comes from the contract, not the prompt");
  assert.match(req.user, /LeadQualified/, "an output event it emits");
  assert.match(req.user, /FABRICATED/, "the contract frames tools as the only allowed surface");
  // the findings to address, with their suggested fix
  assert.match(req.user, /no escalation path/);
  assert.match(req.user, /escalate ambiguous leads to a human/);
  // the prompt under edit, wrapped as DATA (anti-injection)
  assert.match(req.user, /AGENT_BEHAVIOUR_PROMPT/);
  assert.ok(req.user.includes(PROMPT), "the authored prompt itself is included verbatim");
  assert.equal(req.schema, (buildReviseRequest(agentModel, [finding("x")])).schema);
});

test("the revise system prompt demands a minimal, voice-preserving edit and DATA-wraps the prompt", () => {
  const sys = reviseSystemPrompt();
  assert.equal(sys, buildReviseRequest(agentModel, [finding("x")]).system, "exposed prompt is byte-identical to what is sent");
  assert.match(sys, /SMALLEST/i);
  assert.match(sys, /voice/i);
  assert.match(sys, /DATA/, "carries the anti-injection wrapper the prompt-safety CI gate requires");
  assert.match(sys, /(not|never)[\s\S]{0,120}instructions/i);
});

test("buildReviseRequest refuses an agent with no authored behaviour (PR #54: no apply back door)", () => {
  const undesigned = { ...agentModel, agents: { version: "0.1", agents: [{ ...(agentModel.agents as any).agents[0], instructions: "  \n " }] } } as any;
  assert.throws(() => buildReviseRequest(undesigned, [finding("x")]), /nothing to revise/i);
  assert.equal(currentPrompt(undesigned), "", "an undesigned agent has no left side to diff");
});

test("buildReviseRequest refuses an agent that isn't in the model", () => {
  assert.throws(() => buildReviseRequest({ ...agentModel, agentId: "ghost" } as any, [finding("x")]), /not found/i);
});

// ── contract containment (golden invariant #6) ────────────────────────────────────────────────────

test("toolMentions finds backticked tool-shaped names, and ignores prose", () => {
  assert.deepEqual(toolMentions("call `qualify_lead` then `send_offer_email()`"), ["qualify_lead", "send_offer_email"]);
  assert.deepEqual(toolMentions("set the `status` to `draft`"), [], "single words are prose, not tool calls");
  assert.deepEqual(toolMentions("no backticks qualify_lead here"), [], "only the backticked convention counts");
});

test("contractVocabulary covers tools, outputs AND entity fields (a field is tool-shaped too)", () => {
  const vocab = contractVocabulary(contractOf(agentModel));
  assert.ok(vocab.has("qualify_lead"), "a real tool");
  assert.ok(vocab.has("contact_email"), "an entity field — must not be mistaken for an invented tool");
});

test("fabricatedTools catches a tool the revision INVENTED", () => {
  const invented = fabricatedTools(PROMPT, "You qualify leads. Use `qualify_lead`, then `issue_invoice` the customer.", contractOf(agentModel));
  assert.deepEqual(invented, ["issue_invoice"]);
});

test("fabricatedTools passes a revision that stays inside the contract", () => {
  assert.deepEqual(fabricatedTools(PROMPT, "You qualify leads. Use `qualify_lead`, checking `contact_email` first.", contractOf(agentModel)), [], "real tool + real field");
});

// A fabricated tool already in the author's prompt is exactly what a finding is often ABOUT. Blaming the
// revision for it would block the very edit that removes it.
test("fabricatedTools does not blame the revision for a fabrication the AUTHOR already had", () => {
  const authored = "You qualify leads, then `issue_invoice` the customer.";
  assert.deepEqual(fabricatedTools(authored, authored, contractOf(agentModel)), [], "pre-existing = the review's problem, not the edit's");
  assert.deepEqual(fabricatedTools(authored, "You qualify leads. Use `qualify_lead`.", contractOf(agentModel)), [], "removing it is a clean edit");
});

test("reviseAgentPrompt REPAIRS an invented tool with one retry naming the offender", async () => {
  const p = provider("");
  let n = 0;
  p.complete = async (req) => {
    p.calls.push(req.user);
    n++;
    // first attempt fabricates; the retry (which must name the offender) complies
    return { provider: "t", raw: "", json: n === 1
      ? { revised: "You qualify leads. Use `qualify_lead`, then `issue_invoice`.", note: "bad" }
      : { revised: "You qualify leads. Use `qualify_lead`, then ask a human to invoice.", note: "good" } };
  };
  const res = await reviseAgentPrompt(agentModel, [finding("no invoicing step")], p);
  assert.equal(n, 2, "exactly one repair retry");
  assert.match(p.calls[1], /REJECTED/, "the retry tells the model its attempt was rejected");
  assert.match(p.calls[1], /issue_invoice/, "and names the exact invented tool");
  assert.deepEqual(res.repairedTools, ["issue_invoice"], "the guard biting is surfaced, not silent");
  assert.ok(!res.revised.includes("issue_invoice"));
  assert.equal(res.changed, true);
});

test("reviseAgentPrompt FAILS CLOSED when the model keeps inventing a tool", async () => {
  const p = provider("You qualify leads, then `issue_invoice` and `charge_card`.");
  await assert.rejects(
    () => reviseAgentPrompt(agentModel, [finding("no invoicing")], p),
    (e: unknown) => {
      assert.ok(e instanceof FabricatedToolError);
      assert.deepEqual((e as FabricatedToolError).tools, ["issue_invoice", "charge_card"]);
      return true;
    },
    "a prompt that calls a nonexistent tool is a regression — never offer it to the human",
  );
});

// ── the proposal ──────────────────────────────────────────────────────────────────────────────────

test("reviseAgentPrompt returns a PROPOSAL and never mutates the model", async () => {
  const revised = "You qualify leads. Use the `qualify_lead` tool, then hand off. Escalate ambiguous leads to a human.";
  const res = await reviseAgentPrompt(agentModel, [finding("no escalation path")], provider(revised, "Added an escalation clause"));
  assert.equal(res.original, PROMPT, "the diff's left side is the current authored prompt");
  assert.equal(res.revised, revised);
  assert.equal(res.note, "Added an escalation clause");
  assert.equal(res.changed, true);
  assert.deepEqual(res.repairedTools, []);
  // the model is untouched — only an explicit human Accept in the app may write it (invariants #2/#5)
  assert.equal((agentModel.agents as any).agents[0].instructions, PROMPT);
});

test("reviseAgentPrompt reports an unchanged prompt honestly rather than faking a diff", async () => {
  const res = await reviseAgentPrompt(agentModel, [finding("nit")], provider(PROMPT, "No text change needed"));
  assert.equal(res.changed, false);
  assert.equal(res.revised, res.original);
});

test("reviseAgentPrompt refuses an undesigned agent and an empty finding set", async () => {
  const undesigned = { ...agentModel, agents: { version: "0.1", agents: [{ ...(agentModel.agents as any).agents[0], instructions: undefined }] } } as any;
  await assert.rejects(() => reviseAgentPrompt(undesigned, [finding("x")], provider("anything")), /nothing to revise/i);
  await assert.rejects(() => reviseAgentPrompt(agentModel, [], provider("anything")), /at least one finding/i);
});

test("reviseAgentPrompt throws when the model returns no prompt", async () => {
  const p: LlmProvider = { name: "t", complete: async () => ({ provider: "t", raw: "", json: { note: "oops" } }) };
  await assert.rejects(() => reviseAgentPrompt(agentModel, [finding("x")], p), /no revised prompt/i);
});

test("revisionId is stable per agent + finding set, and order-independent", () => {
  const a = finding("one"), b = { ...finding("two"), id: "f2" };
  assert.equal(revisionId("lead_triage", [a, b]), revisionId("lead_triage", [b, a]));
  assert.notEqual(revisionId("lead_triage", [a]), revisionId("lead_triage", [a, b]));
  assert.notEqual(revisionId("other", [a]), revisionId("lead_triage", [a]));
});

test("apply-all sends every finding in ONE request", () => {
  const fs = [finding("no escalation"), { ...finding("no guardrails"), id: "f2" }];
  const req = buildReviseRequest(agentModel, fs);
  assert.match(req.user, /no escalation/);
  assert.match(req.user, /no guardrails/);
  assert.match(req.user, /1\./);
  assert.match(req.user, /2\./);
});
