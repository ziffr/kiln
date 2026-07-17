// External-service CREDENTIALS: the model declares the env var NAME; the value lives in .env and is read
// by the agent runtime, which calls the vendor directly. These tests pin the two halves of that claim —
// the validator that keeps secrets out of the committed model, and the ACTUAL generated auth module.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { validateExternalServices, agentsAdapter, resolveAgentDefs, mockDispatch } from "../src/index.ts";
import { externalServicesEnvExample } from "../src/agents.ts";
import type { ExternalServiceInput, ExternalServicesDoc } from "../src/index.ts";
import type { CapabilityDoc, DomainDoc, AgentsDoc } from "@kiln/compiler";

const caps: CapabilityDoc = { domain: "Solar", capabilities: [{ id: "sales", name: "Sales", purpose: "", outcomes: [] }] } as unknown as CapabilityDoc;
const domain: DomainDoc = {
  aggregates: [{ id: "lead", name: "Lead", owner: "sales", attributes: [{ name: "email", type: "text" }], references: [] }],
  commands: [{ id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", capability: "sales", emits: [] }],
  events: [],
} as unknown as DomainDoc;
const agents: AgentsDoc = { agents: [{ id: "sales_agent", name: "Sales Agent", capabilities: ["sales"], goal: "Win deals" }] } as unknown as AgentsDoc;

const svc = (over: Partial<ExternalServiceInput> = {}): ExternalServiceInput => ({
  id: "svc_crm", name: "CRM", kind: "agent", invocation: "sync", entity: "lead",
  endpoint: "https://api.crm.example.com/v1/score", requestMapping: { email: "email" }, responseMapping: { score: "score" },
  ...over,
});
const doc = (...services: ExternalServiceInput[]): ExternalServicesDoc => ({ version: "0.1", services });
const codes = (d: ExternalServicesDoc) => validateExternalServices(d).map((f) => f.code);

// ── the validator: keep the secret out of the committed model ─────────────────────────────────────────

test("XS1: a credential embedded in the endpoint is rejected — and the message never echoes it", () => {
  const findings = validateExternalServices(doc(svc({ endpoint: "https://usr:s3cr3t@api.crm.example.com/v1" })));
  const f = findings.find((x) => x.code === "XS1");
  assert.ok(f && f.level === "error");
  assert.ok(!f.message.includes("s3cr3t"), "the validator must not print the credential it caught");
  assert.match(f.message, /credentialEnv|\.env/);
});

test("XS2: a token pasted into credentialEnv is rejected (a var NAME is expected), value not echoed", () => {
  const pasted = "sk-live-abc123XYZ";
  const f = validateExternalServices(doc(svc({ credentialEnv: pasted, auth: "bearer" }))).find((x) => x.code === "XS2");
  assert.ok(f && f.level === "error");
  assert.ok(!f.message.includes(pasted), "the validator must not print the pasted secret");
  // a real env var NAME passes
  assert.ok(!codes(doc(svc({ credentialEnv: "CRM_API_TOKEN", auth: "bearer" }))).includes("XS2"));
});

test("XS3: a credential over plaintext http is rejected; https and localhost are fine", () => {
  assert.ok(codes(doc(svc({ endpoint: "http://api.crm.example.com/v1", credentialEnv: "CRM_API_TOKEN", auth: "bearer" }))).includes("XS3"));
  assert.ok(!codes(doc(svc({ endpoint: "http://localhost:9000/v1", credentialEnv: "CRM_API_TOKEN", auth: "bearer" }))).includes("XS3"), "loopback is exempt for dev");
  assert.ok(!codes(doc(svc({ credentialEnv: "CRM_API_TOKEN", auth: "bearer" }))).includes("XS3"), "https is fine");
  // no credential attached → plaintext is not this validator's business
  assert.ok(!codes(doc(svc({ endpoint: "http://api.crm.example.com/v1" }))).includes("XS3"));
});

test("XS4/XS5/XS6: header needs a headerName; a scheme needs a credential; a credential needs a scheme", () => {
  assert.ok(codes(doc(svc({ credentialEnv: "CRM_API_KEY", auth: "header" }))).includes("XS4"));
  assert.ok(!codes(doc(svc({ credentialEnv: "CRM_API_KEY", auth: "header", headerName: "X-API-Key" }))).includes("XS4"));
  assert.ok(codes(doc(svc({ auth: "bearer" }))).includes("XS5"), "a declared scheme with no credentialEnv is unsendable");
  const warn = validateExternalServices(doc(svc({ credentialEnv: "CRM_API_TOKEN", auth: "none" }))).find((f) => f.code === "XS6");
  assert.ok(warn && warn.level === "warn", "a declared-but-never-sent credential warns, not errors");
});

test("a service with no auth declared is clean — the pre-auth model round-trips unchanged", () => {
  assert.deepEqual(validateExternalServices(doc(svc())), []);
  assert.deepEqual(validateExternalServices({ version: "0.1", services: [] }), []);
});

// ── the generated runtime: the ACTUAL emitted src/auth.ts, not a mirror of it ──────────────────────────

type AuthMod = {
  externalAuthHeaders: (
    invoke: { credentialEnv?: string; auth?: string; headerName?: string },
    env: Record<string, string | undefined>,
    service?: string,
  ) => Record<string, string>;
};
async function loadAuth(): Promise<AuthMod> {
  const src = agentsAdapter(caps, domain, agents)["agents/src/auth.ts"];
  assert.ok(src, "agents runtime must emit src/auth.ts");
  const file = join(mkdtempSync(join(tmpdir(), "kiln-agent-auth-")), "auth.ts");
  writeFileSync(file, src);
  return (await import(pathToFileURL(file).href)) as AuthMod;
}

test("generated externalAuthHeaders applies each scheme", async () => {
  const { externalAuthHeaders } = await loadAuth();
  const env = { CRM_API_TOKEN: "tok-123", CRM_BASIC: "usr:pw" };
  assert.deepEqual(externalAuthHeaders({ credentialEnv: "CRM_API_TOKEN", auth: "bearer" }, env), { authorization: "Bearer tok-123" });
  assert.deepEqual(externalAuthHeaders({ credentialEnv: "CRM_API_TOKEN", auth: "header", headerName: "X-API-Key" }, env), { "x-api-key": "tok-123" });
  assert.deepEqual(externalAuthHeaders({ credentialEnv: "CRM_BASIC", auth: "basic" }, env), { authorization: "Basic " + Buffer.from("usr:pw").toString("base64") });
  // none / absent → send nothing, exactly as before this layer existed.
  assert.deepEqual(externalAuthHeaders({}, env), {});
  assert.deepEqual(externalAuthHeaders({ credentialEnv: "CRM_API_TOKEN", auth: "none" }, env), {});
});

test("generated externalAuthHeaders FAILS LOUDLY on a missing env var — naming the var, never a value", async () => {
  const { externalAuthHeaders } = await loadAuth();
  assert.throws(
    () => externalAuthHeaders({ credentialEnv: "CRM_API_TOKEN", auth: "bearer" }, {}, "crm"),
    (e: Error) => e.message.includes("CRM_API_TOKEN") && /not set/.test(e.message) && /\.env/.test(e.message),
    "a missing credential must throw, not call the vendor unauthenticated",
  );
  // an empty string is as missing as absent — it would send "Bearer ".
  assert.throws(() => externalAuthHeaders({ credentialEnv: "CRM_API_TOKEN", auth: "bearer" }, { CRM_API_TOKEN: "" }));
  // unsendable declarations throw rather than silently going out in the clear.
  assert.throws(() => externalAuthHeaders({ auth: "bearer" }, {}), /no credentialEnv/);
  assert.throws(() => externalAuthHeaders({ credentialEnv: "CRM_API_TOKEN", auth: "header" }, { CRM_API_TOKEN: "t" }), /headerName/);
});

test("the emitted tools.ts sends the auth headers on the external call and never logs them", () => {
  const tools = agentsAdapter(caps, domain, agents)["agents/src/tools.ts"];
  assert.match(tools, /import \{ externalAuthHeaders, type ExternalInvoke \} from ".\/auth"/);
  assert.match(tools, /\.\.\.externalAuthHeaders\(tool\.invoke as ExternalInvoke, process\.env, tool\.name\)/);
  // the external branch must not log; the only console.log is the generic fallback AFTER it returns.
  const branch = tools.slice(tools.indexOf('tool.kind === "external"'));
  const external = branch.slice(0, branch.indexOf("console.log"));
  assert.ok(!/console\.(log|error|warn)/.test(external), "the external branch must never log (headers carry the credential)");
  assert.ok(!/headers/.test(external.slice(external.indexOf("return {"))), "the returned result must not include headers");
});

test("resolveAgentDefs threads the credential's NAME (never a value) onto the external tool's invoke", () => {
  const services = doc(svc({ credentialEnv: "CRM_API_TOKEN", auth: "header", headerName: "X-API-Key" }));
  const defs = resolveAgentDefs(caps, domain, agents, undefined, undefined, services);
  const tool = defs[0].tools.find((t) => t.kind === "external");
  assert.ok(tool);
  assert.deepEqual(tool.invoke.credentialEnv, "CRM_API_TOKEN");
  assert.deepEqual(tool.invoke.auth, "header");
  assert.deepEqual(tool.invoke.headerName, "X-API-Key");
  // the committed definition JSON carries names only.
  const files = agentsAdapter(caps, domain, agents, undefined, undefined, services);
  const def = files["agents/definitions/sales_agent.json"];
  assert.match(def, /CRM_API_TOKEN/);
  assert.ok(!/tok-|sk-/.test(def), "a definition must never carry a credential value");
});

// ── .env.example lists the NAMES ──────────────────────────────────────────────────────────────────────

test(".env.example lists each declared credential var by name + the service needing it — never a value", () => {
  const services = doc(
    svc({ id: "svc_crm", name: "CRM Scorer", credentialEnv: "CRM_API_TOKEN", auth: "bearer" }),
    svc({ id: "svc_rev", name: "Reviewer", credentialEnv: "REVIEWER_KEY", auth: "header", headerName: "X-API-Key" }),
  );
  const env = agentsAdapter(caps, domain, agents, undefined, undefined, services)["agents/.env.example"];
  assert.match(env, /^CRM_API_TOKEN=\s*# CRM Scorer$/m);
  assert.match(env, /^REVIEWER_KEY=\s*# Reviewer$/m);
  assert.match(env, /External services/);
  // a service with no credential contributes no var; two services sharing one var list it once.
  assert.equal(externalServicesEnvExample(doc(svc())), "");
  const shared = externalServicesEnvExample(doc(svc({ id: "a", name: "A", credentialEnv: "SHARED", auth: "bearer" }), svc({ id: "b", name: "B", credentialEnv: "SHARED", auth: "bearer" })));
  assert.equal(shared.match(/^SHARED=/gm)?.length, 1);
  assert.match(shared, /# A, B/);
});

// ── the mock stays honest ─────────────────────────────────────────────────────────────────────────────

test("mockDispatch makes NO call and says whether a real run would have authenticated", () => {
  const authed = mockDispatch({ name: "svc_crm", kind: "external", description: "", invoke: { invocation: "sync", service: "svc_crm", auth: "bearer", credentialEnv: "CRM_API_TOKEN" } }, {}) as Record<string, unknown>;
  assert.equal(authed.wouldAuthenticate, true);
  assert.match(String(authed.note), /no external service was called/i);
  assert.match(String(authed.note), /CRM_API_TOKEN/);
  const bare = mockDispatch({ name: "svc_x", kind: "external", description: "", invoke: { invocation: "sync", service: "svc_x" } }, {}) as Record<string, unknown>;
  assert.equal(bare.wouldAuthenticate, false);
  assert.match(String(bare.note), /unauthenticated/i);
});
