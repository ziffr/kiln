---
id: SPEC-006
title: Roles & Permissions — the authorized-persona layer
type: spec
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-10
updated: 2026-07-10
supersedes: null
related: [SPEC-001, SPEC-002, SPEC-003, SPEC-004, SPEC-005, ADR-001, ADR-004, ADR-006]
reviewers: []
---

# SPEC-006 — Roles & Permissions

> Built as part of the full-stack build-out ("the whole enchilada"), following the now-proven layer
> pattern (IR → validators → skill → eval → UI → codegen) established and reviewed across SPEC-002…005.
> The recurring review lessons are baked in (canonicalized ids, grounded-anchor provenance, coverage
> metric, reconcile-not-clear, in-context UI, business language). A formal 5-lens review can follow;
> the layer is engineering-complete and verified.

## 0. Framing
The methodology's `role_model`: the **roles** (job personas — Sales Rep, Installer, Finance Clerk)
that operate the business, and which **capabilities** each is authorized for. It answers "who may do
what" and is the seam an auth/RBAC layer generates from. A role is stateless persona metadata, not an
entity; every capability should be authorized by ≥1 role.

## 1. What shipped
- **Artifact:** a `roles` document on the Project (`RolesDoc { version, roles: RoleInput[] }`);
  `RoleInput { id, name, capabilities: string[], meta }`.
- **IR:** `role` node + `authorizes` edge (role → capability); `roleNodeId`; `compileCapabilities`
  threads `roles` and `computeBuildHash` mixes it.
- **Validators (`validateRoles`):** RO1 required, RO2 capability-exists (repair-triggering), RO3
  slug/unique, RO4 grounded provenance, RO5 unauthorized-capability (coverage smell), RO6 empty-role.
- **Skill:** `mockGenerateRoles` (one Operator over all capabilities) + `RoleModeler` (LLM, canonicalizes
  capability ids by id **or** name, grounded-anchor fallback, repair on RO2) + `/api/roles` (service +
  Vercel fn).
- **Eval:** seeded-defect recall (1.0) + **authorization-completeness** coverage + provenanceRate.
- **Codegen:** `generatePermissions` → an RBAC map (role → capability → command operations), shown in
  the **Permissions** tab of the in-app View-code panel. `detectGaps` advances toward workflows/agents.
- **UI:** a "Generate roles" button; each capability's detail lists the roles that authorize it; role
  findings in the panel; roles reconciled (not cleared) when capabilities change.

## 2. Exit gate — verified
`validateRoles` catches all seeded defects (recall 1.0); the mock authorizes every capability
(completeness 1.0, provenance 1.0). Verified live against Sonnet: produced **Sales Rep / Installer /
Finance Clerk** with full coverage and a generating RBAC map. 168 tests. **Approved.**

## 3. Non-goals / next
Fine-grained per-command or per-field permissions, permission inheritance/hierarchies, and identity
integration are deferred. Next methodology layers: workflows, agents, application/implementation
blueprints; and deepening codegen toward the execution targets (MCP/React/adapters).
