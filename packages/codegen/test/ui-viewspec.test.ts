import { test } from "node:test";
import assert from "node:assert/strict";
import { shadcnAdapter } from "../src/ui.ts";

const caps = { version: "0.2", domain: "solar", capabilities: [{ id: "p", name: "Pipeline" }] } as never;
const domain = { version: "0.1", aggregates: [{ id: "lead", name: "Lead", owner: "p", references: [],
  attributes: [{ name: "contactName", type: "text" }, { name: "dealValue", type: "money" }, { name: "stage", type: "text" }] }],
  commands: [], events: [] } as never;

test("shadcn full-stack list page honours the view spec (board + metrics + badge)", () => {
  const views = { lead: { layout: "board", groupBy: "stage", titleField: "contactName",
    metrics: [{ label: "Leads", agg: "count" }, { label: "Pipeline", agg: "sum", field: "dealValue", format: "money" }],
    card: { title: "contactName", badge: "stage", meta: ["dealValue"] },
    columns: [{ field: "contactName", format: "text" }, { field: "stage", format: "badge" }, { field: "dealValue", format: "money" }],
    formFields: ["contactName", "dealValue"] } };
  const files = shadcnAdapter(caps, domain, undefined, undefined, undefined, undefined, undefined, views as never);
  const list = files["src/pages/LeadList.tsx"];
  assert.match(list, /metricValue/, "renders KPI metrics");
  assert.match(list, /board view for Lead/, "board layout chosen");
  assert.match(list, /new Set\(rows\.map/, "groups rows for the board");
  assert.match(list, /formatCell\(r\["stage"\], "badge"\)/, "badge formatting");
  assert.ok(files["src/lib/format.tsx"] && files["src/components/ui/badge.tsx"], "ships the format helper + Badge");
});

test("full-stack UI ships + wires the shadcn primitives (DataTable/DropdownMenu/Sheet/Tabs/Chart)", () => {
  const withChild = { version: "0.1", aggregates: [
    ...(domain as { aggregates: unknown[] }).aggregates,
    { id: "note", name: "Note", owner: "p", references: ["lead"], attributes: [{ name: "body", type: "text" }] },
  ], commands: [{ id: "qualify", name: "Qualify", aggregate: "lead", capability: "p", emits: [] }], events: [] };
  const views = { lead: { layout: "table", metrics: [{ label: "Leads", agg: "count" }], columns: [{ field: "name", format: "text" }, { field: "stage", format: "badge" }, { field: "amount", format: "money" }] } };
  const files = shadcnAdapter(caps, withChild as never, undefined, undefined, undefined, undefined, undefined, views as never);
  for (const c of ["data-table", "dropdown-menu", "sheet", "tabs"]) assert.ok(files[`src/components/ui/${c}.tsx`], `${c} component`);
  assert.ok(files["src/components/charts/DistributionChart.tsx"], "chart component");
  const list = files["src/pages/LeadList.tsx"];
  assert.match(list, /<DataTable/); assert.match(list, /DropdownMenu/); assert.match(list, /<Sheet/); assert.match(list, /DistributionChart/);
  assert.match(files["src/pages/LeadDetail.tsx"], /<Tabs/, "related entities become tabs on the detail page");
  const pkg = JSON.parse(files["package.json"]).dependencies;
  assert.ok(pkg.recharts && pkg["@radix-ui/react-tabs"] && pkg["@radix-ui/react-dialog"] && pkg["@radix-ui/react-dropdown-menu"], "deps added");
});

test("no view spec → a sortable/filterable DataTable (back-compat default)", () => {
  const files = shadcnAdapter(caps, domain);
  assert.match(files["src/pages/LeadList.tsx"], /table view for Lead/);
  assert.match(files["src/pages/LeadList.tsx"], /<DataTable/);
  assert.ok(files["src/components/ui/data-table.tsx"], "ships the DataTable component");
});
