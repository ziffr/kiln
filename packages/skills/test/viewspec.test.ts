/**
 * ViewSpec vocabulary (layout / metrics / groupBy / card) — validateSpec must allow-list every field
 * reference to the entity's real fields and clamp enums, so a spec can never reference something that
 * doesn't exist (build-safe) and a board can never render without a group.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSpec } from "../src/index.ts";

const entity = { id: "lead", name: "Lead", fields: [
  { name: "name", type: "text" }, { name: "stage", type: "text" }, { name: "amount", type: "money" },
] } as never;

test("board keeps a real groupBy and drops bad metric/card field refs", () => {
  const v = validateSpec({
    layout: "board", groupBy: "stage",
    metrics: [{ label: "Total", agg: "count" }, { label: "Pipeline", agg: "sum", field: "amount", format: "money" }, { label: "Junk", agg: "sum", field: "ghost" }],
    card: { title: "name", badge: "stage", meta: ["amount", "ghost"] },
    columns: [{ field: "name", format: "text" }, { field: "stage", format: "badge" }],
    formFields: ["name", "amount", "stage"],
  }, entity)!;
  assert.equal(v.layout, "board");
  assert.equal(v.groupBy, "stage");
  assert.equal(v.metrics?.length, 2, "the sum-over-a-nonexistent-field metric is dropped");
  assert.deepEqual(v.card, { title: "name", subtitle: undefined, badge: "stage", meta: ["amount"] });
});

test("board without a groupBy degrades to cards (never a broken board)", () => {
  const v = validateSpec({ layout: "board", columns: [{ field: "name", format: "text" }], formFields: ["name"] }, entity)!;
  assert.equal(v.layout, "cards");
  assert.equal(v.groupBy, undefined);
});

test("unknown layout + a bad groupBy fall away cleanly", () => {
  const v = validateSpec({ layout: "fancy", groupBy: "ghost", metrics: [{ label: "x", agg: "median", field: "amount" }], columns: [{ field: "name", format: "text" }], formFields: ["name"] }, entity)!;
  assert.equal(v.layout, undefined, "unknown layout dropped → table");
  assert.equal(v.groupBy, undefined, "non-existent groupBy dropped");
  assert.equal(v.metrics, undefined, "invalid agg dropped → no metrics");
});
