import { test } from "node:test";
import assert from "node:assert/strict";
import { syncNarrative, NARRATIVE_SYNC_SYSTEM_PROMPT, type LlmProvider } from "../src/index.ts";

test("syncNarrative short-circuits with no facts (no LLM call)", async () => {
  let called = false;
  const provider: LlmProvider = { name: "test", complete: async () => { called = true; return { provider: "test", raw: "", json: {} }; } };
  const r = await syncNarrative("# Biz", [], provider);
  assert.deepEqual(r.additions, []);
  assert.equal(called, false);
});

test("syncNarrative returns the model's proposed additions, filtering blanks", async () => {
  const provider: LlmProvider = {
    name: "test",
    complete: async (req) => {
      // the facts are wrapped as DATA in the user prompt
      assert.match(req.user, /FACTS now true/);
      return { provider: "test", raw: "", json: { additions: ["When a purchase order is approved, it is sent to the supplier automatically.", "  ", ""] } };
    },
  };
  const r = await syncNarrative("# Biz\n## Purpose\nSell solar.", ["on purchase_order_approved → then send_to_supplier"], provider);
  assert.equal(r.additions.length, 1);
  assert.match(r.additions[0], /purchase order is approved/);
});

test("the narrative-sync prompt forbids technical ids and marks input as DATA", () => {
  assert.match(NARRATIVE_SYNC_SYSTEM_PROMPT, /DATA/);
  assert.match(NARRATIVE_SYNC_SYSTEM_PROMPT, /never technical ids|business terms/i);
});
