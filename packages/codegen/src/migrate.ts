/**
 * @kiln/codegen/migrate — model-diff → incremental store migration (Postgres or SQLite).
 *
 * The store adapters emit a full CREATE-TABLE schema — fine for a fresh database, destructive against a
 * deployed one with data. This diffs the DEPLOYED model's domain against the NEW one and emits a migration:
 * additive changes (ADD COLUMN, CREATE TABLE, ADD FK) are applied automatically; drops and type-changes are
 * BREAKING — surfaced and emitted COMMENTED OUT, so a human decides on data preservation before applying.
 * Dialect-aware (postgres | sqlite) so the migration matches whichever store engine the app is bound to.
 *
 * Pure + isomorphic (mirrors the adapters' naming/types so migrated schema == freshly-generated schema).
 */

import { slug } from "@kiln/ir";
import { attributeSpecs, type AggregateInput, type DomainDoc, type AttrType } from "@kiln/compiler";
import { PG_TYPE, SQLITE_TYPE } from "./targets.ts";

export type Dialect = "postgres" | "sqlite";

export interface BreakingChange {
  kind: "drop_table" | "drop_column" | "change_type";
  table: string;
  column?: string;
  detail: string;
}
export interface MigrationResult {
  /** additive statements — safe to apply as-is. */
  up: string[];
  /** breaking changes — need human approval (can lose data); emitted commented in `sql`. */
  breaking: BreakingChange[];
  sql: string;
  hasChanges: boolean;
}

const TYPES: Record<Dialect, Record<AttrType, string>> = { postgres: PG_TYPE, sqlite: SQLITE_TYPE };
const colType = (dialect: Dialect, t?: AttrType): string => (t ? TYPES[dialect][t] : dialect === "sqlite" ? "TEXT" : "text");

function createTable(a: AggregateInput, tableIds: Set<string>, dialect: Dialect): string {
  const pk = dialect === "sqlite" ? "  id TEXT PRIMARY KEY" : "  id text PRIMARY KEY";
  const cols = [pk];
  for (const attr of attributeSpecs(a)) cols.push(`  ${slug(attr.name)} ${colType(dialect, attr.type)}`);
  for (const ref of a.references ?? []) if (tableIds.has(slug(ref))) cols.push(`  ${slug(ref)}_id ${dialect === "sqlite" ? "TEXT" : "text"} REFERENCES ${slug(ref)}(id)`);
  const head = dialect === "sqlite" ? `CREATE TABLE IF NOT EXISTS ${slug(a.id)} (` : `CREATE TABLE ${slug(a.id)} (`;
  return `${head}\n${cols.join(",\n")}\n);`;
}

/** Diff the old domain's tables/columns against the new one → an additive-by-default migration. */
export function migrate(oldDomain: DomainDoc, newDomain: DomainDoc, dialect: Dialect = "postgres"): MigrationResult {
  const up: string[] = [];
  const breaking: BreakingChange[] = [];
  const oldById = new Map(oldDomain.aggregates.map((a) => [a.id, a]));
  const newById = new Map(newDomain.aggregates.map((a) => [a.id, a]));
  const newTableIds = new Set(newDomain.aggregates.map((a) => slug(a.id)));

  for (const a of oldDomain.aggregates) if (!newById.has(a.id)) breaking.push({ kind: "drop_table", table: slug(a.id), detail: `entity "${a.name || a.id}" removed` });

  for (const a of newDomain.aggregates) {
    const table = slug(a.id);
    const old = oldById.get(a.id);
    if (!old) {
      up.push(createTable(a, newTableIds, dialect));
      continue;
    }
    const oldAttrs = new Map(attributeSpecs(old).map((s) => [slug(s.name), s.type]));
    const newAttrs = new Map(attributeSpecs(a).map((s) => [slug(s.name), s.type]));
    for (const [col, type] of newAttrs) {
      if (!oldAttrs.has(col)) up.push(`ALTER TABLE ${table} ADD COLUMN ${col} ${colType(dialect, type)};`);
      else if ((oldAttrs.get(col) ?? "text") !== (type ?? "text")) breaking.push({ kind: "change_type", table, column: col, detail: `${col}: ${oldAttrs.get(col) ?? "text"} → ${type ?? "text"} (a type change may not preserve data)` });
    }
    for (const [col] of oldAttrs) if (!newAttrs.has(col)) breaking.push({ kind: "drop_column", table, column: col, detail: `column "${col}" removed` });

    const oldRefs = new Set((old.references ?? []).map((r) => slug(r)));
    const newRefs = new Set((a.references ?? []).map((r) => slug(r)));
    for (const ref of newRefs) if (!oldRefs.has(ref) && newTableIds.has(ref)) up.push(`ALTER TABLE ${table} ADD COLUMN ${ref}_id ${dialect === "sqlite" ? "TEXT" : "text"} REFERENCES ${ref}(id);`);
    for (const ref of oldRefs) if (!newRefs.has(ref)) breaking.push({ kind: "drop_column", table, column: `${ref}_id`, detail: `reference to "${ref}" removed` });
  }

  return { up, breaking, sql: renderMigration(up, breaking, dialect), hasChanges: up.length > 0 || breaking.length > 0 };
}

/** Back-compat alias — the Postgres dialect. */
export function migratePostgres(oldDomain: DomainDoc, newDomain: DomainDoc): MigrationResult {
  return migrate(oldDomain, newDomain, "postgres");
}

function breakingStmt(b: BreakingChange, dialect: Dialect): string {
  if (b.kind === "drop_table") return `DROP TABLE ${b.table};`;
  if (b.kind === "drop_column") return `ALTER TABLE ${b.table} DROP COLUMN ${b.column};${dialect === "sqlite" ? "  -- SQLite ≥ 3.35" : ""}`;
  return dialect === "sqlite" ? `-- SQLite can't ALTER COLUMN TYPE — rebuild ${b.table} (create new, copy, drop, rename).` : `ALTER TABLE ${b.table} ALTER COLUMN ${b.column} TYPE <new type> USING ...;`;
}

function renderMigration(up: string[], breaking: BreakingChange[], dialect: Dialect): string {
  const L = [
    `-- Generated by @kiln/codegen — incremental migration (model diff, ${dialect}).`,
    "-- ADDITIVE changes below are safe to apply. BREAKING changes are commented out — review each,",
    "-- decide how to preserve/backfill data, then uncomment to apply. Never run these blind on production.",
    "",
  ];
  if (dialect === "sqlite") L.push("PRAGMA foreign_keys = ON;", "");
  if (up.length) L.push("-- ── Additive (safe) ──", ...up, "");
  if (breaking.length) {
    L.push("-- ── BREAKING — human approval required (can LOSE DATA) ──");
    for (const b of breaking) L.push(`-- ${b.kind}: ${b.detail}`, `-- ${breakingStmt(b, dialect)}`, "");
  }
  if (!up.length && !breaking.length) L.push("-- No schema changes.");
  return L.join("\n").trim() + "\n";
}
