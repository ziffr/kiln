/**
 * Agent run-history + run COMPARE — the pure half (no React, no storage, no I/O).
 *
 * Phase 2 of the agent lifecycle: the run trace shipped, but only the LAST run per agent was kept, so you
 * could not see the EFFECT of a prompt edit. These helpers keep a bounded history and diff two traces of
 * the same agent so the loop "tune the prompt → re-run → compare before/after" closes.
 *
 * The discipline is borrowed from `diffCritique` (@kiln/skills): frame the change HONESTLY rather than dump
 * a raw diff. A run delta only tells you something about your prompt edit if the prompt actually changed and
 * the model stayed the same — so `compareRuns` reports those two facts first (`samePrompt` / `sameModel`) and
 * derives an explicit `verdict`. A "faster, cheaper" delta across two different models is not a prompt A/B,
 * and an identical prompt on the same model diffs nothing but nondeterminism. Both are named, not hidden.
 *
 * Everything here is observability, NEVER IR (golden invariant #1): it is an inspection sidecar, it never
 * feeds back into the model and it is never rendered into the canvas as truth.
 */

import type { RunTrace } from "./projects.ts";

/** How many runs we keep per agent (newest first). Traces are FAT — every step carries the tool args AND the
 *  tool result — and they ride in localStorage (ADR-005) and in an exported model.json, so the history is
 *  bounded hard. ONE place to change the bound. */
export const AGENT_RUN_HISTORY_MAX = 5;

/** Push a fresh trace onto an agent's history: newest first, capped at `max`. Pure — returns a new array. */
export function pushRunHistory(history: RunTrace[] | undefined, trace: RunTrace, max: number = AGENT_RUN_HISTORY_MAX): RunTrace[] {
  return [trace, ...(history ?? [])].slice(0, Math.max(0, max));
}

/** A before→after numeric delta. `delta` is after − before (positive = the second run used more). */
export interface RunDelta {
  before: number;
  after: number;
  delta: number;
}

/** Which tools each run called, as a set diff over `steps[].toolCall.name`. */
export interface ToolSetDiff {
  /** called by the AFTER run only. */
  added: string[];
  /** called by the BEFORE run only. */
  removed: string[];
  /** called by both. */
  unchanged: string[];
}

export type WordDiffOp = "same" | "add" | "del";
/** One run of words in the final-output diff. */
export interface WordSpan {
  op: WordDiffOp;
  text: string;
}

/** Why the two runs might differ — stated plainly rather than implied.
 *  - `prompt-changed`  — same model, the system prompt differs → your edit is the candidate cause.
 *  - `same-prompt`     — same model AND the same system prompt → any delta is model nondeterminism, not you.
 *  - `different-model` — the runs used different models/engines → NOT a clean prompt A/B, whatever else changed. */
export type CompareVerdict = "prompt-changed" | "same-prompt" | "different-model";

export interface RunComparison {
  steps: RunDelta;
  tokens: RunDelta;
  costUsd: RunDelta;
  /** wall-clock gap between the two captures (after.at − before.at, ms). Negative if the picks are inverted. */
  elapsedMs: number;
  /** the system prompts are byte-identical. */
  samePrompt: boolean;
  /** both runs used the same model AND the same provider. */
  sameModel: boolean;
  model: { before?: string; after?: string };
  provider: { before?: string; after?: string };
  /** the two runs were given the same task (a different task is its own confound). */
  sameTask: boolean;
  /** either run contains a MOCK-dispatched tool step — the diff is of simulated behaviour, not production. */
  simulated: boolean;
  tools: ToolSetDiff;
  /** word-level diff of `finalText`, before → after. */
  finalText: WordSpan[];
  finalTextChanged: boolean;
  verdict: CompareVerdict;
}

const tokensOf = (t: RunTrace): number => (t.usage?.input ?? 0) + (t.usage?.output ?? 0);
const delta = (before: number, after: number): RunDelta => ({ before, after, delta: after - before });

/** The distinct tool names a trace called, in first-call order. */
export function toolNames(trace: RunTrace): string[] {
  const seen: string[] = [];
  for (const s of trace.steps ?? []) {
    const n = s.toolCall?.name;
    if (n && !seen.includes(n)) seen.push(n);
  }
  return seen;
}

/** Set-diff the tools two runs called. */
export function diffTools(before: RunTrace, after: RunTrace): ToolSetDiff {
  const b = toolNames(before), a = toolNames(after);
  return {
    added: a.filter((n) => !b.includes(n)),
    removed: b.filter((n) => !a.includes(n)),
    unchanged: a.filter((n) => b.includes(n)),
  };
}

/** Split text into diffable tokens — words with their trailing whitespace, so joining spans restores the text. */
function tokenize(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

/** Above this many tokens per side the O(n·m) LCS table gets expensive; we degrade to a whole-text
 *  replace rather than freeze the UI. Honest: the diff then says "all of it changed" — visibly coarse,
 *  instead of pretending to a precision we didn't compute. */
const WORD_DIFF_MAX_TOKENS = 2500;

/** Merge adjacent spans with the same op so the render is a few blocks, not one <span> per word. */
function coalesce(spans: WordSpan[]): WordSpan[] {
  const out: WordSpan[] = [];
  for (const s of spans) {
    if (!s.text) continue;
    const last = out[out.length - 1];
    if (last && last.op === s.op) last.text += s.text;
    else out.push({ ...s });
  }
  return out;
}

/** Word-level diff (LCS) of two texts. Pure + dependency-free; spans concatenate back to the sources
 *  (same+del → before, same+add → after). */
export function diffWords(before: string, after: string): WordSpan[] {
  if (before === after) return before ? [{ op: "same", text: before }] : [];
  const a = tokenize(before), b = tokenize(after);
  if (!a.length) return b.length ? [{ op: "add", text: after }] : [];
  if (!b.length) return [{ op: "del", text: before }];
  if (a.length > WORD_DIFF_MAX_TOKENS || b.length > WORD_DIFF_MAX_TOKENS) {
    return coalesce([{ op: "del", text: before }, { op: "add", text: after }]);
  }

  // LCS length table over (a.length+1) × (b.length+1), walked back into a span list.
  const w = b.length + 1;
  const lcs = new Int32Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * w + j] = a[i] === b[j]
        ? lcs[(i + 1) * w + (j + 1)] + 1
        : Math.max(lcs[(i + 1) * w + j], lcs[i * w + (j + 1)]);
    }
  }
  const spans: WordSpan[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { spans.push({ op: "same", text: a[i] }); i++; j++; }
    else if (lcs[(i + 1) * w + j] >= lcs[i * w + (j + 1)]) { spans.push({ op: "del", text: a[i] }); i++; }
    else { spans.push({ op: "add", text: b[j] }); j++; }
  }
  while (i < a.length) { spans.push({ op: "del", text: a[i] }); i++; }
  while (j < b.length) { spans.push({ op: "add", text: b[j] }); j++; }
  return coalesce(spans);
}

/** Compare two runs of the SAME agent, before → after. Pure: no I/O, no storage, no model mutation. */
export function compareRuns(before: RunTrace, after: RunTrace): RunComparison {
  const samePrompt = before.system === after.system;
  const sameModel = before.model === after.model && before.provider === after.provider;
  return {
    steps: delta(before.stepCount ?? 0, after.stepCount ?? 0),
    tokens: delta(tokensOf(before), tokensOf(after)),
    costUsd: delta(before.estCostUsd ?? 0, after.estCostUsd ?? 0),
    elapsedMs: (after.at ?? 0) - (before.at ?? 0),
    samePrompt,
    sameModel,
    model: { before: before.model, after: after.model },
    provider: { before: before.provider, after: after.provider },
    sameTask: (before.task ?? "") === (after.task ?? ""),
    simulated: [before, after].some((t) => (t.steps ?? []).some((s) => s.simulated)),
    tools: diffTools(before, after),
    finalText: diffWords(before.finalText ?? "", after.finalText ?? ""),
    finalTextChanged: (before.finalText ?? "") !== (after.finalText ?? ""),
    // A cross-model run isn't a clean prompt A/B even if the prompt ALSO changed — so the model
    // difference dominates the verdict; the prompt flag is still reported alongside it.
    verdict: !sameModel ? "different-model" : samePrompt ? "same-prompt" : "prompt-changed",
  };
}
