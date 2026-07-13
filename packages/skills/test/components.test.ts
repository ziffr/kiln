import { test } from "node:test";
import assert from "node:assert/strict";
import { generateComponents } from "../src/index.ts";
import { generateApp } from "@kiln/codegen";
import type { CapabilityDoc, DomainDoc } from "@kiln/compiler";

const caps: CapabilityDoc = { version: "0.2", domain: "solar", capabilities: [{ id: "sales", name: "Sales" }] };
const domain: DomainDoc = { version: "0.1", aggregates: [{ id: "offer", name: "Offer", owner: "sales", attributes: [{ name: "amount", type: "money" }, { name: "status", type: "text" }] }], commands: [], events: [], policies: [] } as any;

test("generateComponents validates specs against real fields/formats; drops bogus refs", async () => {
  const provider = { name: "t", complete: async (req: any) => {
    assert.match(req.user, /Offer/); // one focused call per entity
    return { provider: "t", raw: "", json: { description: "Manage offers", titleField: "amount",
      columns: [{ field: "amount", format: "money" }, { field: "status", format: "badge" }, { field: "ghost", format: "text" }, { field: "amount", format: "bogusfmt" }],
      formFields: ["amount", "status", "ghost"] } };
  } } as any;
  const res = await generateComponents(caps, domain, undefined, provider);
  const v = res.views.offer;
  assert.ok(v, "spec emitted");
  assert.deepEqual(v.columns.map((c: any) => c.field), ["amount", "status", "amount"]); // 'ghost' dropped
  assert.equal(v.columns[1].format, "badge");
  assert.equal(v.columns[2].format, "text"); // 'bogusfmt' coerced
  assert.deepEqual(v.formFields, ["amount", "status"]); // 'ghost' dropped
  assert.equal(res.written, 1);
});

test("generateApp emits views.js (data, not JSX) and EntityScreen consumes VIEWS", () => {
  const files = generateApp(caps, domain, undefined, undefined, undefined, { offer: { columns: [{ field: "amount", format: "money" }], formFields: ["amount"], description: "Offers" } });
  assert.match(files["web/src/views.js"], /VIEWS =/);
  assert.match(files["web/src/views.js"], /"amount".*"money"/s);
  assert.match(files["web/src/components/EntityScreen.jsx"], /import \{ VIEWS \} from '\.\.\/views\.js'/);
  // no view spec → views.js is an empty object (build-safe by construction)
  const bare = generateApp(caps, domain);
  assert.match(bare["web/src/views.js"], /VIEWS = \{\}/);
});
