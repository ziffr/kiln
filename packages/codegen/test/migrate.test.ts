import { test } from "node:test";
import assert from "node:assert/strict";
import { migratePostgres } from "../src/index.ts";
import type { DomainDoc } from "@vbd/compiler";

const dom = (aggregates: unknown[]): DomainDoc => ({ version: "1", aggregates } as unknown as DomainDoc);
const lead = (attrs: unknown[], refs: string[] = []) => ({ id: "lead", name: "Lead", owner: "sales", attributes: attrs, references: refs });

test("additive: new column + new entity + new FK are safe ALTER/CREATE (no breaking)", () => {
  const oldD = dom([lead([{ name: "email", type: "text" }])]);
  const newD = dom([
    lead([{ name: "email", type: "text" }, { name: "score", type: "number" }], ["customer"]),
    { id: "customer", name: "Customer", owner: "sales", attributes: [{ name: "name", type: "text" }], references: [] },
  ]);
  const m = migratePostgres(oldD, newD);
  assert.equal(m.breaking.length, 0);
  assert.ok(m.up.includes("ALTER TABLE lead ADD COLUMN score numeric;"));
  assert.ok(m.up.some((s) => s.startsWith("CREATE TABLE customer (")));
  assert.ok(m.up.includes("ALTER TABLE lead ADD COLUMN customer_id text REFERENCES customer(id);"));
  // additive statements are live SQL in the file
  assert.match(m.sql, /ALTER TABLE lead ADD COLUMN score numeric;/);
});

test("breaking: dropped column, dropped table, and type change are flagged + commented (never live)", () => {
  const oldD = dom([lead([{ name: "email", type: "text" }, { name: "phone", type: "text" }]), { id: "note", name: "Note", owner: "sales", attributes: [], references: [] }]);
  const newD = dom([lead([{ name: "email", type: "number" }])]); // phone dropped, note table dropped, email text→number
  const m = migratePostgres(oldD, newD);
  const kinds = m.breaking.map((b) => b.kind).sort();
  assert.deepEqual(kinds, ["change_type", "drop_column", "drop_table"]);
  // breaking statements are COMMENTED OUT in the emitted SQL (human must uncomment)
  assert.match(m.sql, /-- ALTER TABLE lead DROP COLUMN phone;/);
  assert.match(m.sql, /-- DROP TABLE note;/);
  assert.match(m.sql, /BREAKING — human approval required/);
  // and NOT emitted as live SQL
  assert.doesNotMatch(m.sql, /^ALTER TABLE lead DROP COLUMN phone;/m);
  assert.doesNotMatch(m.sql, /^DROP TABLE note;/m);
});

test("no changes → hasChanges false", () => {
  const d = dom([lead([{ name: "email", type: "text" }])]);
  const m = migratePostgres(d, d);
  assert.equal(m.hasChanges, false);
  assert.match(m.sql, /No schema changes/);
});
