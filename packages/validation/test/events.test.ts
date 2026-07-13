import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEvents } from "../src/index.ts";
import type { DomainDoc } from "@kiln/compiler";

const capIds = ["lead_management", "billing"];
const base: DomainDoc = {
  version: "0.2",
  aggregates: [
    { id: "lead", name: "Lead", owner: "lead_management" },
    { id: "invoice", name: "Invoice", owner: "billing" },
  ],
  events: [
    { id: "lead_qualified", name: "Lead Qualified", aggregate: "lead", trigger: "command", meta: { origin: "llm", derivedFrom: [{ anchor: "sales" }] } },
    { id: "invoice_issued", name: "Invoice Issued", aggregate: "invoice", trigger: "command", meta: { origin: "llm", derivedFrom: [{ anchor: "fin" }] } },
    { id: "invoice_overdue", name: "Invoice Overdue", aggregate: "invoice", trigger: "time", meta: { origin: "llm", derivedFrom: [{ anchor: "fin" }] } },
  ],
  commands: [
    { id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", capability: "lead_management", emits: ["lead_qualified"], meta: { origin: "llm", derivedFrom: [{ anchor: "sales" }] } },
    { id: "issue_invoice", name: "Issue Invoice", aggregate: "invoice", capability: "billing", emits: ["invoice_issued"], meta: { origin: "llm", derivedFrom: [{ anchor: "fin" }] } },
  ],
};

test("a well-formed behaviour model produces no blocking/major findings", () => {
  const f = validateEvents(base, capIds);
  assert.ok(!f.some((x) => x.severity === "blocker" || x.severity === "major"), JSON.stringify(f));
});

test("a time-triggered event with no emitter does NOT get CE8 (only command-triggered do)", () => {
  const f = validateEvents(base, capIds);
  assert.ok(!f.some((x) => x.code === "CE8.orphan_event" && x.subjects.includes("invoice_overdue")));
});

test("CE2 flags a command targeting a non-existent aggregate or capability", () => {
  const d: DomainDoc = { ...base, commands: [{ id: "x", name: "X", aggregate: "ghost", capability: "nope", emits: [], meta: { origin: "authored" } }] };
  const f = validateEvents(d, capIds);
  assert.ok(f.some((x) => x.code === "CE2.command_target" && x.subjects.includes("ghost")));
  assert.ok(f.some((x) => x.code === "CE2.command_target" && x.subjects.includes("nope")));
});

test("CE3 flags an event on a non-existent aggregate", () => {
  const d: DomainDoc = { ...base, events: [{ id: "e", name: "E", aggregate: "ghost", trigger: "command", meta: { origin: "authored" } }], commands: [] };
  assert.ok(validateEvents(d, capIds).some((x) => x.code === "CE3.event_source" && x.subjects.includes("ghost")));
});

test("CE4 flags a command emitting an unknown event", () => {
  const d: DomainDoc = { ...base, commands: [{ id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", capability: "lead_management", emits: ["nonexistent"], meta: { origin: "authored" } }] };
  assert.ok(validateEvents(d, capIds).some((x) => x.code === "CE4.emit_target" && x.subjects.includes("nonexistent")));
});

test("CE.emit_boundary flags a command emitting another entity's event (hidden saga)", () => {
  const d: DomainDoc = {
    ...base,
    commands: [{ id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", capability: "lead_management", emits: ["invoice_issued"], meta: { origin: "authored" } }],
  };
  assert.ok(validateEvents(d, capIds).some((x) => x.code === "CE.emit_boundary"));
});

test("CE5 flags a duplicate id across the command+event namespaces", () => {
  const d: DomainDoc = {
    ...base,
    events: [{ id: "dup", name: "Dup", aggregate: "lead", trigger: "command", meta: { origin: "authored" } }],
    commands: [{ id: "dup", name: "Dup", aggregate: "lead", capability: "lead_management", emits: ["dup"], meta: { origin: "authored" } }],
  };
  assert.ok(validateEvents(d, capIds).some((x) => x.code === "CE5.unique" && x.subjects.includes("dup")));
});

test("CE6 flags an llm command/event lacking a grounded anchor", () => {
  const d: DomainDoc = {
    ...base,
    commands: [{ id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", capability: "lead_management", emits: ["lead_qualified"], meta: { origin: "llm", derivedFrom: [{ capability: "lead_management" }] } }],
  };
  assert.ok(validateEvents(d, capIds).some((x) => x.code === "CE6.provenance"));
});

test("CE7 warns on an aggregate no command changes", () => {
  const d: DomainDoc = { ...base, commands: [{ id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", capability: "lead_management", emits: ["lead_qualified"], meta: { origin: "authored" } }] };
  assert.ok(validateEvents(d, capIds).some((x) => x.code === "CE7.no_command" && x.subjects.includes("invoice")));
});
