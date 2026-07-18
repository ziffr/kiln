---
id: INDEX
title: Documentation Index
type: policy
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-10
updated: 2026-07-18
---

# Documentation Index

Regenerated whenever a document is added or changes status. See `CONVENTIONS.md`.

| ID | Title | Type | Status | Version |
|----|-------|------|--------|---------|
| CONV-001 | Documentation Conventions & Policy | policy | Approved | 1.0.0 |
| SPEC-001 | MVP — Narrative → Capability Map → Review Loop | spec | Approved | 0.2.0 |
| SPEC-002 | Domain Model Layer — aggregates, events, commands | spec | Approved | 1.0.0 |
| SPEC-003 | Business Areas (Subdomains) — the capability-grouping layer | spec | Approved | 1.0.0 |
| SPEC-004 | Commands & Events — the behaviour layer on the domain model | spec | Approved | 1.0.0 |
| SPEC-005 | Policies & Reactions — cross-entity workflow rules | spec | Approved | 1.0.0 |
| SPEC-006 | Roles & Permissions — the authorized-persona layer | spec | Approved | 1.0.0 |
| SPEC-007 | Workflows — end-to-end multi-step processes | spec | Approved | 1.0.0 |
| SPEC-008 | Agents — autonomous operators + codegen pipeline end | spec | Approved | 1.0.0 |
| SPEC-010 | Engine Plugin Seam — contract + registry for pluggable engines | spec | Draft | 0.1.0 |
| SPEC-011 | Versioned Workspaces — git-backed model history + semantic diff | spec | Draft | 0.1.0 |
| SPEC-012 | Deployment Placement — where each engine runs, as a binding dimension | spec | Approved | 1.1.0 |
| SPEC-013 | Agent Tool Connectors — typed external-system tools + Nango OAuth (no n8n dependency) | spec | Approved | 1.1.0 |
| SPEC-014 | Agent Runtime Lifecycle — durable long-lived & HITL agents (Postgres); n8n retained for workflows | spec | Approved | 1.1.0 |
| PLAN-001 | MVP Execution Plan (M0–M5) | plan | Approved | 0.4.0 |
| PLAN-013 | Connector / Nango Ergonomics (SPEC-013 Phase B3) — choose-your-Nango, optional helper, self-sufficient export | plan | Approved | 1.0.0 |
| RES-001 | Codegen probe — model → scaffolding, and what's missing | research | Approved | 1.0.0 |
| RES-002 | Execution-engine binding — model → multi-backend deployment-target compiler | research | Draft | 0.5.0 |
| RES-003 | Agent- & workflow-runtime provider landscape — codegen-fit scoring | research | Draft | 0.1.0 |
| RES-004 | DBOS Transact spike — durable agent state, scheduling & HITL, verified with real code | research | Draft | 0.1.0 |
| ADR-001 | TypeScript end-to-end (shared IR contract) | adr | Approved | 1.0.0 |
| ADR-002 | Storage & source-of-truth model | adr | Approved | 1.0.0 |
| ADR-003 | Front-end stack — React + Vite SPA, hosted, bilingual, IR-driven | adr | Approved | 1.0.0 |
| ADR-004 | LLM provider & skill runtime | adr | Approved | 1.1.0 |
| ADR-005 | Project store — client-side (localStorage) for the MVP | adr | Superseded | 1.0.0 |
| ADR-006 | Server-side project persistence — filesystem workspace store | adr | Approved | 1.0.0 |

## Reviews

| ID | Target | Lens | Verdict | Status |
|----|--------|------|---------|--------|
| REV-001 | SPEC-001 | product-strategy | Approve-with-changes | Approved |
| REV-002 | SPEC-001 | technical-architecture | Approve-with-changes | Approved |
| REV-003 | SPEC-001 | ai-llm-feasibility | Approve-with-changes | Approved |
| REV-004 | SPEC-001 | ux-hitl | Approve-with-changes | Approved |
| REV-005 | SPEC-001 | security-data | Approve-with-changes | Approved |
| REV-006 | PLAN-001 | delivery-execution | Approve-with-changes | Approved |
| REV-007 | SPEC-002 | domain-modeling | Approve-with-changes | Approved |
| REV-008 | SPEC-002 | product-strategy | Approve-with-changes | Approved |
| REV-009 | SPEC-002 | ai-llm-feasibility | Approve-with-changes | Approved |
| REV-010 | SPEC-002 | technical-architecture | Approve-with-changes | Approved |
| REV-011 | SPEC-002 | ux-hitl | Approve-with-changes | Approved |
| REV-012 | SPEC-003 | product-strategy | Approve-with-changes | Approved |
| REV-013 | SPEC-003 | domain-modeling | Approve-with-changes | Approved |
| REV-014 | SPEC-003 | ai-llm-feasibility | Approve-with-changes | Approved |
| REV-015 | SPEC-003 | technical-architecture | Approve-with-changes | Approved |
| REV-016 | SPEC-003 | ux-hitl | Approve-with-changes | Approved |
| REV-017 | SPEC-004 | product-strategy | Approve-with-changes | Approved |
| REV-018 | SPEC-004 | domain-modeling | Approve-with-changes | Approved |
| REV-019 | SPEC-004 | ai-llm-feasibility | Approve-with-changes | Approved |
| REV-020 | SPEC-004 | technical-architecture | Approve-with-changes | Approved |
| REV-021 | SPEC-004 | ux-hitl | Approve-with-changes | Approved |
| REV-022 | SPEC-005 | product-strategy | Approve-with-changes | Approved |
| REV-023 | SPEC-005 | domain-modeling | Approve-with-changes | Approved |
| REV-024 | SPEC-005 | ai-llm-feasibility | Approve-with-changes | Approved |
| REV-025 | SPEC-005 | technical-architecture | Approve-with-changes | Approved |
| REV-026 | SPEC-005 | ux-hitl | Approve-with-changes | Approved |
| REV-027 | SPEC-012 | technical-architecture | Approve-with-changes | Approved |
| REV-028 | SPEC-012 | product-strategy | Approve-with-changes | Approved |
| REV-029 | SPEC-012 | delivery-execution | Approve-with-changes | Approved |
| REV-030 | SPEC-012 | security-data | Approve-with-changes | Approved |
| REV-031 | SPEC-012 | extensibility-dx | Approve-with-changes | Approved |
| REV-032 | SPEC-013 | technical-architecture | Approve-with-changes | Approved |
| REV-033 | SPEC-013 | security-data | Approve-with-changes (re-reviewed: SEC1 closed) | Approved |
| REV-034 | SPEC-013 | product-strategy | Approve-with-changes | Approved |
| REV-035 | SPEC-013 | extensibility-dx | Reject → Approve-with-changes (re-reviewed) | Approved |
| REV-036 | SPEC-013 | ux-hitl | Approve-with-changes | Approved |
| REV-037 | SPEC-014 | technical-architecture | Reject → Approve-with-changes (re-reviewed) | Approved |
| REV-038 | SPEC-014 | security-data | Reject → Approve-with-changes (re-reviewed) | Approved |
| REV-039 | SPEC-014 | product-strategy | Approve-with-changes | Approved |
| REV-040 | SPEC-014 | extensibility-dx | Reject → Approve-with-changes (re-reviewed) | Approved |
| REV-041 | SPEC-014 | ux-hitl | Approve-with-changes | Approved |
