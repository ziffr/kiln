# Add a MySQL store engine 🟢

**Labels:** `good first issue`, `new-engine`
**Capability role:** `store`
**Difficulty:** beginner — mirror the existing Postgres engine.
**Reference to copy:** `packages/codegen/src/engines/postgres.ts` (+ `postgresAdapter` in `targets.ts`).

## Why

VBD can host a business's data on Postgres or SQLite. MySQL/MariaDB is one of the most common
databases in small-business hosting, so a MySQL **store** engine widens who can run a generated
system with zero code changes to their stack. This is the ideal first engine — a store adapter is the
simplest kind, and Postgres is a complete worked example to copy.

## What to build

Add one engine that provides the `store` capability (like Postgres, minus row-level security).

1. **`packages/codegen/src/engines/mysql.ts`** — an `EngineAdapter` (see [SPEC-010 §4.1](../specs/SPEC-010-engine-plugin-seam.md)):

   ```ts
   import type { EngineAdapter } from "./registry";
   import { buildMysqlSchema } from "./mysql-schema"; // your schema emitter (or inline it)

   export const mysqlEngineAdapter: EngineAdapter = {
     engine: {
       id: "mysql",
       name: "MySQL",
       reach: "sql",
       provides: {
         store: "native",
         authorize: "partial", // GRANTs, but no row-level security like Postgres RLS
         emit: "none", operate: "partial", react: "none", sequence: "none", "serve-ui": "none",
       },
     },
     applies: (ctx) => ctx.resolved.some((r) => r.kind === "aggregate" && r.engineId === "mysql"),
     generate: (ctx) => ({ files: { "mysql/schema.sql": buildMysqlSchema(ctx) } }),
   };
   ```

2. **The schema emitter** — copy `postgresAdapter`'s structure and swap the type mapping to MySQL:
   - `text → VARCHAR(255)` / `TEXT`, `number → DOUBLE` (or `INT` where whole), `money → DECIMAL(12,2)`,
     `boolean → TINYINT(1)`, `date → DATE`/`DATETIME`, `reference → VARCHAR` FK.
   - `CREATE TABLE IF NOT EXISTS`, `PRIMARY KEY (id)`, `FOREIGN KEY … REFERENCES` for references.
   - Engine `InnoDB`, `utf8mb4`. No RLS (that's the `authorize: "partial"` honesty).

3. **Register it:** add `registerEngine(mysqlEngineAdapter)` in `packages/codegen/src/engines/index.ts`.

4. **Test** `packages/codegen/test/engine-mysql.test.ts` — assert the adapter emits `mysql/schema.sql`
   for a model whose store binds to `mysql`, that it contains a `CREATE TABLE` per aggregate with the
   right column types, and that references become foreign keys.

## Acceptance criteria

- `node --test packages/*/test/*.test.ts` — all green, including your new test.
- Binding a model's `store` to `mysql` and exporting (`./vbd.sh export --binding <mysql-binding.json>`)
  produces a `mysql/schema.sql` that a real MySQL 8 accepts: `mysql < mysql/schema.sql` runs clean
  (please paste the output in the PR).
- No `node:*` imports in `engines/mysql.ts` (isomorphism rule).
- Conventional Commit title, e.g. `feat(engines): add MySQL store engine`.

## Out of scope

Migrations (the `--since` diff) and a docker-compose service for MySQL — those can be follow-ups.
