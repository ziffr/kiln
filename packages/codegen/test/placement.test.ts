import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolvePlacement,
  validatePlacement,
  projectPlacement,
  registerDeployTarget,
  getDeployTarget,
  registeredDeployTargets,
  type Binding,
  type DeployTarget,
} from "../src/index.ts";

test("resolvePlacement: unspecified engine defaults to local, with a defaulted reach var", () => {
  const p = resolvePlacement({ defaults: {} }, "postgres");
  assert.equal(p.mode, "local");
  assert.equal(p.urlEnv, "DATABASE_URL");
});

test("resolvePlacement: authored spec wins; urlEnv defaults per engine when omitted", () => {
  const b: Binding = { defaults: {}, hosting: { postgres: { mode: "managed" } } };
  const p = resolvePlacement(b, "postgres");
  assert.equal(p.mode, "managed");
  assert.equal(p.urlEnv, "DATABASE_URL");
  // explicit urlEnv overrides the default
  assert.equal(resolvePlacement({ defaults: {}, hosting: { n8n: { mode: "managed", urlEnv: "MY_N8N" } } }, "n8n").urlEnv, "MY_N8N");
});

test("validatePlacement: all-local → no findings", () => {
  assert.deepEqual(validatePlacement({ defaults: {} }, ["postgres", "n8n", "node", "shadcn"]), []);
});

test("validatePlacement: PB1 — a managed engine with no reachable address", () => {
  // an engine id not in the default reach table, managed, no url → unreachable.
  const b: Binding = { defaults: {}, hosting: { customstore: { mode: "managed" } } };
  const findings = validatePlacement(b, ["customstore"]);
  assert.ok(findings.find((f) => f.code === "PB1"), "expected PB1");
});

test("validatePlacement: PB3 — unknown deploy target", () => {
  const b: Binding = { defaults: {}, hosting: { postgres: { mode: "managed", target: "nope" } } };
  assert.ok(validatePlacement(b, ["postgres"]).find((f) => f.code === "PB3"));
});

test("validatePlacement: PB2 — target cannot host the engine", () => {
  // vercel hosts the UI only; asking it to host postgres is invalid.
  const b: Binding = { defaults: {}, hosting: { postgres: { mode: "managed", target: "vercel" } } };
  assert.ok(validatePlacement(b, ["postgres"]).find((f) => f.code === "PB2"));
});

test("validatePlacement: PB5 — a hosting.url carrying an embedded credential is rejected", () => {
  const b: Binding = { defaults: {}, hosting: { postgres: { mode: "managed", url: "postgres://user:secret@db.example.com/app" } } };
  const findings = validatePlacement(b, ["postgres"]);
  assert.ok(findings.find((f) => f.code === "PB5" && f.level === "error"), "expected PB5 for a credentialed url");
  // a credential-free url is fine
  assert.equal(validatePlacement({ defaults: {}, hosting: { postgres: { mode: "managed", url: "postgres://db.example.com/app" } } }, ["postgres"]).find((f) => f.code === "PB5"), undefined);
});

test("validatePlacement: a managed engine on a target whose modes exclude 'managed' → PB2", () => {
  // (docker supports only local/selfhost) — force it explicitly.
  const b: Binding = { defaults: {}, hosting: { node: { mode: "managed", target: "docker" } } };
  assert.ok(validatePlacement(b, ["node"]).find((f) => f.code === "PB2"));
});

test("validatePlacement: PB4 — a platform and its store placed apart (warn)", () => {
  const b: Binding = { defaults: {}, hosting: { odoo: { mode: "managed", target: "managed" }, postgres: { mode: "local" } } };
  const findings = validatePlacement(b, ["odoo", "postgres"]);
  assert.ok(findings.find((f) => f.code === "PB4" && f.level === "warn"));
});

test("projectPlacement: all-local → anyRemote false, no files/env/prunes", () => {
  const r = projectPlacement({ defaults: {} }, ["postgres", "n8n", "node", "shadcn"], "postgres", "solar");
  assert.equal(r.anyRemote, false);
  assert.deepEqual(r.files, {});
  assert.deepEqual(r.env, {});
  assert.deepEqual(r.prunedComposeServices, []);
});

test("projectPlacement: managed postgres prunes its compose service and adds a reach var", () => {
  const b: Binding = { defaults: {}, hosting: { postgres: { mode: "managed", target: "managed" } } };
  const r = projectPlacement(b, ["postgres", "n8n"], "postgres", "solar");
  assert.equal(r.anyRemote, true);
  assert.ok(r.prunedComposeServices.includes("postgres"));
  assert.ok(r.env["DATABASE_URL"], "expected a DATABASE_URL reach line");
  assert.equal(r.engines["postgres"].mode, "managed");
});

test("projectPlacement: spine on fly emits spine/fly.toml with the app name", () => {
  const b: Binding = { defaults: {}, hosting: { node: { mode: "managed", target: "fly" } } };
  const r = projectPlacement(b, ["node"], "postgres", "solar");
  assert.ok(r.files["spine/fly.toml"]);
  assert.match(r.files["spine/fly.toml"], /app = "solar-spine"/);
  assert.ok(r.prunedComposeServices.includes("spine"));
});

test("projectPlacement: a bare managed engine (no target) is PLACED by the generic managed target, not silently dropped", () => {
  // regression for the silent-no-op finding: managed spine with no explicit target.
  const b: Binding = { defaults: {}, hosting: { node: { mode: "managed" } } };
  const r = projectPlacement(b, ["node"], "postgres", "solar");
  assert.equal(r.anyRemote, true);
  assert.ok(r.prunedComposeServices.includes("spine"), "spine service should be pruned");
  assert.ok(r.env["SPINE_URL"], "a SPINE_URL reach var should be emitted");
  assert.ok(r.placements.find((p) => p.engineId === "node"), "a PLACEMENT row for the spine");
});

test("projectPlacement: a THIRD-PARTY engine is placeable via the generic managed target with NO core edit (cross-seam)", () => {
  // an engine id unknown to the built-in tables; the author declares its reach var inline.
  const b: Binding = { defaults: {}, hosting: { clickhouse: { mode: "managed", urlEnv: "CLICKHOUSE_URL" } } };
  const r = projectPlacement(b, ["clickhouse"], "postgres", "solar");
  assert.equal(r.anyRemote, true);
  assert.ok(r.env["CLICKHOUSE_URL"], "the third-party reach var is emitted");
  assert.ok(r.prunedComposeServices.includes("clickhouse"));
  assert.ok(r.placements.find((p) => p.engineId === "clickhouse"));
});

test("resolvePlacement: agentRuntime reconciliation — a non-node agent runtime resolves as managed", () => {
  // the langdock agent runtime is a REMOTE managed workspace, not a local engine.
  const b: Binding = { defaults: {}, agentRuntime: "langdock" };
  assert.equal(resolvePlacement(b, "langdock").mode, "managed");
  // an explicit hosting entry still wins over the shorthand
  assert.equal(resolvePlacement({ ...b, hosting: { langdock: { mode: "selfhost" } } }, "langdock").mode, "selfhost");
});

test("projectPlacement: url with credentials is REDACTED in the resolved engines manifest (deployment.json source)", () => {
  const b: Binding = { defaults: {}, hosting: { postgres: { mode: "managed", url: "postgres://user:secret@db/app" } } };
  const r = projectPlacement(b, ["postgres"], "postgres", "solar");
  assert.doesNotMatch(JSON.stringify(r.engines), /secret/, "the password must be stripped from the manifest");
});

test("deploy registry: register a fake target, look it up, sorted iteration", () => {
  const fake: DeployTarget = {
    id: "zzz_fake_target",
    name: "Fake",
    modes: ["managed"],
    hosts: () => true,
    generate: () => ({ reach: "fake" }),
  };
  registerDeployTarget(fake);
  assert.equal(getDeployTarget("zzz_fake_target"), fake);
  const ids = registeredDeployTargets().map((t) => t.id);
  // built-ins are present and iteration is sorted by id
  for (const id of ["docker", "fly", "managed", "vercel"]) assert.ok(ids.includes(id), `missing ${id}`);
  assert.deepEqual([...ids], [...ids].sort());
});
