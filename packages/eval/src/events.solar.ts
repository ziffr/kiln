/**
 * Seeded-defect corpus + human-blessed reference behaviour for the solar entities (SPEC-004 §8).
 */

import type { DomainDoc } from "@kiln/compiler";
import type { EventsEvalCase, BehaviourReference } from "./events.ts";

const capIds = ["lead_management", "billing"];
const aggregates = [
  { id: "lead", name: "Lead", owner: "lead_management" },
  { id: "invoice", name: "Invoice", owner: "billing" },
];
const grounded = { origin: "llm", derivedFrom: [{ anchor: "boundary" }] };

const clean: DomainDoc = {
  version: "0.2",
  aggregates,
  events: [
    { id: "lead_qualified", name: "Lead Qualified", aggregate: "lead", trigger: "command", meta: grounded },
    { id: "invoice_issued", name: "Invoice Issued", aggregate: "invoice", trigger: "command", meta: grounded },
  ],
  commands: [
    { id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", capability: "lead_management", emits: ["lead_qualified"], meta: grounded },
    { id: "issue_invoice", name: "Issue Invoice", aggregate: "invoice", capability: "billing", emits: ["invoice_issued"], meta: grounded },
  ],
};

export const solarEventsCorpus: EventsEvalCase[] = [
  { id: "clean", description: "A well-formed behaviour model — no findings.", domain: clean, capabilityIds: capIds, expected: [] },
  {
    id: "dangling-command-target",
    description: "A command targeting a missing entity — CE2.",
    domain: { ...clean, commands: [{ id: "x", name: "X", aggregate: "ghost", capability: "lead_management", emits: [], meta: grounded }] },
    capabilityIds: capIds,
    expected: [{ code: "CE2.command_target", subject: "ghost" }],
  },
  {
    id: "event-bad-source",
    description: "An event on a missing entity — CE3.",
    domain: { ...clean, events: [{ id: "e", name: "E", aggregate: "ghost", trigger: "command", meta: grounded }], commands: [] },
    capabilityIds: capIds,
    expected: [{ code: "CE3.event_source", subject: "ghost" }],
  },
  {
    id: "unknown-emit",
    description: "A command emitting an unknown event — CE4.",
    domain: { ...clean, commands: [{ id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", capability: "lead_management", emits: ["ghost"], meta: grounded }] },
    capabilityIds: capIds,
    expected: [{ code: "CE4.emit_target", subject: "ghost" }],
  },
  {
    id: "cross-entity-emit",
    description: "A command emitting another entity's event — CE.emit_boundary.",
    domain: { ...clean, commands: [{ id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", capability: "lead_management", emits: ["invoice_issued"], meta: grounded }] },
    capabilityIds: capIds,
    expected: [{ code: "CE.emit_boundary" }],
  },
  {
    id: "ungrounded",
    description: "An llm command with no boundary evidence — CE6.",
    domain: { ...clean, commands: [{ id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", capability: "lead_management", emits: ["lead_qualified"], meta: { origin: "llm", derivedFrom: [{ capability: "lead_management" }] } }] },
    capabilityIds: capIds,
    expected: [{ code: "CE6.provenance" }],
  },
];

/** The commands a faithful solar behaviour model should recover (event-storming, not CRUD). */
export const solarBehaviourReference: BehaviourReference = [
  { aggregate: "lead", commands: ["Qualify Lead", "Convert Lead"] },
  { aggregate: "invoice", commands: ["Issue Invoice", "Record Payment"] },
];
