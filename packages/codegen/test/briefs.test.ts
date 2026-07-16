import { test } from "node:test";
import assert from "node:assert/strict";
import { commandBriefs, briefsIndex } from "../src/briefs.ts";
import { resolveBinding, DEFAULT_BINDING } from "../src/index.ts";
import type { DomainDoc, RolesDoc, WorkflowsDoc, CapabilityDoc, ContextsDoc } from "@kiln/compiler";

const caps = {
  domain: "Test",
  capabilities: [
    { id: "leads", name: "Leads", purpose: "", outcomes: [] },
    { id: "billing", name: "Billing", purpose: "", outcomes: [] },
  ],
} as unknown as CapabilityDoc;

const domain: DomainDoc = {
  aggregates: [
    { id: "lead", name: "Lead", owner: "leads", attributes: [{ name: "email", type: "text" }], references: [] },
    { id: "invoice", name: "Invoice", owner: "billing", attributes: [{ name: "amount", type: "money" }], references: ["lead"] },
  ],
  commands: [
    { id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", capability: "leads", emits: ["lead_qualified"] },
    { id: "issue_invoice", name: "Issue Invoice", aggregate: "invoice", capability: "billing", emits: [] },
  ],
  events: [{ id: "lead_qualified", name: "Lead Qualified", aggregate: "lead", trigger: "command" }],
  policies: [{ id: "p1", name: "Invoice on qualify", on: "lead_qualified", then: "issue_invoice", condition: "lead has a budget" }],
} as DomainDoc;

const roles: RolesDoc = { roles: [{ id: "rep", name: "Rep", capabilities: ["leads"] }] } as RolesDoc;
const workflows: WorkflowsDoc = { workflows: [{ id: "onboard", name: "Onboard", steps: ["qualify_lead", "issue_invoice"] }] } as WorkflowsDoc;
const contexts: ContextsDoc = { contexts: [{ id: "sales", name: "Sales", capabilities: ["leads", "billing"] }] } as ContextsDoc;

test("commandBriefs: one brief per command, correct path + name", () => {
  const briefs = commandBriefs(domain);
  assert.equal(briefs.length, 2);
  const q = briefs.find((b) => b.id === "qualify_lead")!;
  assert.equal(q.path, "briefs/qualify_lead.md");
  assert.equal(q.name, "Qualify Lead");
});

test("commandBriefs: LOCKED tier is grounded — inputs, emitted events, triggers, roles", () => {
  const briefs = commandBriefs(domain, { roles, workflows });
  const q = briefs.find((b) => b.id === "qualify_lead")!.markdown;
  // input field from the aggregate's typed attributes
  assert.match(q, /`email` — text/);
  // emitted event (derived postcondition)
  assert.match(q, /Lead Qualified/);
  assert.match(q, /`lead_qualified`/);
  // triggered-by: it is a step in the Onboard workflow
  assert.match(q, /Onboard/);
  // authorized role that operates the issuing capability
  assert.match(q, /Rep/);
  // the three tiers are all present
  assert.match(q, /LOCKED by the model/);
  assert.match(q, /FRAME/);
  assert.match(q, /DECIDE/);
});

test("commandBriefs: a policy reaction shows as a trigger on the reacted command, with its guard in DECIDE", () => {
  const briefs = commandBriefs(domain, { roles, workflows });
  const issue = briefs.find((b) => b.id === "issue_invoice")!.markdown;
  // issue_invoice is the `then` of policy p1 → it is triggered by the reaction
  assert.match(issue, /reaction to \*\*Lead Qualified\*\*/);
  assert.match(issue, /policy p1/);
  // the policy's plain-language condition is surfaced as a guard to IMPLEMENT (DECIDE), not as a fact
  assert.match(issue, /lead has a budget/);
  assert.match(issue, /not evaluated/);
});

test("commandBriefs: 'Runs on' reflects the binding's operate engine", () => {
  const resolved = resolveBinding(DEFAULT_BINDING, caps, domain, contexts, roles, workflows);
  const briefs = commandBriefs(domain, { resolved });
  const q = briefs.find((b) => b.id === "qualify_lead")!.markdown;
  // DEFAULT_BINDING routes operate→node → "the generated spine (node)"
  assert.match(q, /Runs on:\*\* the generated spine \(node\)/);
});

test("commandBriefs: step delegation to an external service appears under Delegation", () => {
  const wfWithDelegation = {
    workflows: [{ id: "onboard", name: "Onboard", steps: ["qualify_lead"], stepBindings: { qualify_lead: "svc_qualifier" } }],
  } as unknown as WorkflowsDoc;
  const services = { services: [{ id: "svc_qualifier", name: "Acme Qualifier", kind: "workflow", invocation: "sync" }] } as any;
  const briefs = commandBriefs(domain, { workflows: wfWithDelegation, services });
  const q = briefs.find((b) => b.id === "qualify_lead")!.markdown;
  assert.match(q, /delegated to \*\*Acme Qualifier\*\*/);
});

test("commandBriefs: no commands → no briefs", () => {
  assert.deepEqual(commandBriefs({ aggregates: [], commands: [] } as unknown as DomainDoc), []);
});

test("briefsIndex: links every brief", () => {
  const briefs = commandBriefs(domain);
  const idx = briefsIndex(briefs);
  assert.match(idx, /\[`qualify_lead`\]\(briefs\/qualify_lead\.md\)/);
  assert.match(idx, /\[`issue_invoice`\]\(briefs\/issue_invoice\.md\)/);
});
