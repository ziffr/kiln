/**
 * Agent run history + run compare — the pure helpers. The panel that renders them is verified in the
 * browser; here we lock the logic that must be TRUE for the render to be honest: the history cap, the
 * tool set-diff, the word diff (spans must reconstruct both sides), and — the whole point of the feature —
 * the verdict: a delta is only attributable to a prompt edit when the prompt changed and the model didn't.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENT_RUN_HISTORY_MAX, pushRunHistory, toolNames, diffTools, diffWords, compareRuns } from "../src/runDiff.ts";
import type { RunTrace, RunStep } from "../src/projects.ts";

const trace = (o: Partial<RunTrace> = {}): RunTrace => ({
  at: 1_000,
  system: "You are a lead qualifier.",
  task: "Qualify the newest lead",
  steps: [],
  finalText: "Done.",
  stepCount: 1,
  model: "claude-sonnet-5",
  provider: "anthropic",
  usage: { input: 100, output: 50 },
  estCostUsd: 0.01,
  ...o,
});
const tool = (name: string, simulated = true): RunStep => ({ toolCall: { name, input: {} }, toolResult: { output: "ok" }, simulated });

// ---------------------------------------------------------------- history

test("pushRunHistory puts the newest run first", () => {
  const a = trace({ at: 1 }), b = trace({ at: 2 });
  assert.deepEqual(pushRunHistory(pushRunHistory(undefined, a), b).map((t) => t.at), [2, 1]);
});

test("pushRunHistory caps the history at AGENT_RUN_HISTORY_MAX, dropping the oldest", () => {
  let h: RunTrace[] = [];
  for (let i = 1; i <= 8; i++) h = pushRunHistory(h, trace({ at: i }));
  assert.equal(AGENT_RUN_HISTORY_MAX, 5);
  assert.equal(h.length, 5);
  assert.deepEqual(h.map((t) => t.at), [8, 7, 6, 5, 4]); // newest 5 kept, 1..3 evicted
});

test("pushRunHistory is pure — the input array is not mutated", () => {
  const h = [trace({ at: 1 })];
  const next = pushRunHistory(h, trace({ at: 2 }));
  assert.equal(h.length, 1);
  assert.notEqual(next, h);
});

// ---------------------------------------------------------------- tools

test("toolNames lists distinct tools in first-call order", () => {
  const t = trace({ steps: [tool("get_lead"), tool("score_lead"), tool("get_lead")] });
  assert.deepEqual(toolNames(t), ["get_lead", "score_lead"]);
});

test("diffTools splits added / removed / unchanged", () => {
  const before = trace({ steps: [tool("get_lead"), tool("score_lead")] });
  const after = trace({ steps: [tool("get_lead"), tool("notify_rep")] });
  assert.deepEqual(diffTools(before, after), { added: ["notify_rep"], removed: ["score_lead"], unchanged: ["get_lead"] });
});

test("diffTools on runs with no tool calls is empty, not undefined", () => {
  assert.deepEqual(diffTools(trace(), trace()), { added: [], removed: [], unchanged: [] });
});

// ---------------------------------------------------------------- word diff

const rebuild = (spans: ReturnType<typeof diffWords>, side: "before" | "after"): string =>
  spans.filter((s) => s.op === "same" || s.op === (side === "before" ? "del" : "add")).map((s) => s.text).join("");

test("diffWords marks identical text as one 'same' span", () => {
  assert.deepEqual(diffWords("hello world", "hello world"), [{ op: "same", text: "hello world" }]);
});

test("diffWords on empty texts returns no spans", () => {
  assert.deepEqual(diffWords("", ""), []);
});

test("diffWords isolates the changed word", () => {
  const spans = diffWords("the lead is warm", "the lead is hot");
  assert.deepEqual(spans.filter((s) => s.op === "del").map((s) => s.text.trim()), ["warm"]);
  assert.deepEqual(spans.filter((s) => s.op === "add").map((s) => s.text.trim()), ["hot"]);
});

test("diffWords spans reconstruct BOTH sides exactly", () => {
  const before = "Qualified the lead: score 7, owner Ana.";
  const after = "Qualified the lead: score 9, owner Ana, and notified the rep.";
  const spans = diffWords(before, after);
  assert.equal(rebuild(spans, "before"), before);
  assert.equal(rebuild(spans, "after"), after);
});

test("diffWords handles a pure insertion and a pure deletion", () => {
  assert.equal(rebuild(diffWords("", "brand new"), "after"), "brand new");
  assert.deepEqual(diffWords("gone now", ""), [{ op: "del", text: "gone now" }]);
});

test("diffWords coalesces adjacent same-op words into one span", () => {
  const spans = diffWords("a b c", "a x y z c");
  assert.equal(spans.filter((s) => s.op === "add").length, 1); // "x y z " is ONE span, not three
});

test("diffWords degrades to a whole-text replace beyond the token cap (stays fast + honest)", () => {
  const before = Array.from({ length: 3000 }, (_, i) => `w${i}`).join(" ");
  const after = Array.from({ length: 3000 }, (_, i) => `v${i}`).join(" ");
  const spans = diffWords(before, after);
  assert.deepEqual(spans.map((s) => s.op), ["del", "add"]);
  assert.equal(rebuild(spans, "before"), before);
  assert.equal(rebuild(spans, "after"), after);
});

// ---------------------------------------------------------------- compare

test("compareRuns reports before/after deltas", () => {
  const before = trace({ at: 1_000, stepCount: 2, usage: { input: 100, output: 50 }, estCostUsd: 0.01 });
  const after = trace({ at: 4_000, stepCount: 5, usage: { input: 200, output: 130 }, estCostUsd: 0.03, system: "changed" });
  const c = compareRuns(before, after);
  assert.deepEqual(c.steps, { before: 2, after: 5, delta: 3 });
  assert.deepEqual(c.tokens, { before: 150, after: 330, delta: 180 });
  assert.equal(c.costUsd.delta.toFixed(2), "0.02");
  assert.equal(c.elapsedMs, 3_000);
});

test("compareRuns: same model + CHANGED prompt → the edit is the candidate cause", () => {
  const c = compareRuns(trace({ system: "old prompt" }), trace({ system: "new prompt" }));
  assert.equal(c.samePrompt, false);
  assert.equal(c.sameModel, true);
  assert.equal(c.verdict, "prompt-changed");
});

test("compareRuns: same model + IDENTICAL prompt → nondeterminism, not your edit", () => {
  const c = compareRuns(trace({ finalText: "a" }), trace({ finalText: "b" }));
  assert.equal(c.samePrompt, true);
  assert.equal(c.verdict, "same-prompt");
  assert.equal(c.finalTextChanged, true); // the output moved even though the prompt did not
});

test("compareRuns: different model → NOT a clean prompt A/B, even when the prompt also changed", () => {
  const c = compareRuns(trace({ model: "claude-haiku-4-5", system: "old" }), trace({ model: "claude-opus-4-1", system: "new" }));
  assert.equal(c.sameModel, false);
  assert.equal(c.samePrompt, false);
  assert.equal(c.verdict, "different-model"); // the model difference dominates
  assert.deepEqual(c.model, { before: "claude-haiku-4-5", after: "claude-opus-4-1" });
});

test("compareRuns treats a different PROVIDER as a different model", () => {
  const c = compareRuns(trace({ provider: "anthropic" }), trace({ provider: "openrouter" }));
  assert.equal(c.sameModel, false);
  assert.equal(c.verdict, "different-model");
});

test("compareRuns flags a different task (its own confound) and simulated runs", () => {
  const c = compareRuns(trace({ task: "one", steps: [tool("get_lead")] }), trace({ task: "two" }));
  assert.equal(c.sameTask, false);
  assert.equal(c.simulated, true); // either side having a mock-dispatched tool is enough
});

test("compareRuns reports simulated:false when neither run mock-dispatched a tool", () => {
  const c = compareRuns(trace({ steps: [tool("get_lead", false)] }), trace({ steps: [] }));
  assert.equal(c.simulated, false);
});

test("compareRuns tolerates a sparse trace (no usage / no cost / no steps)", () => {
  const bare = { at: 1, system: "s", task: "t", steps: [], finalText: "", stepCount: 0 } as RunTrace;
  const c = compareRuns(bare, bare);
  assert.deepEqual(c.tokens, { before: 0, after: 0, delta: 0 });
  assert.deepEqual(c.costUsd, { before: 0, after: 0, delta: 0 });
  assert.equal(c.finalTextChanged, false);
  assert.deepEqual(c.finalText, []);
});
