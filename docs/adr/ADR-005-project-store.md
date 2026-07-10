---
id: ADR-005
title: Project store — client-side (localStorage) for the MVP, git-backed workspaces later
type: adr
status: Superseded
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-10
updated: 2026-07-10
supersedes: null
related: [SPEC-001, ADR-002, ADR-003]
---

# ADR-005 — Project store

## Status
Approved. Interim decision for the MVP; explicitly a stepping stone toward ADR-002.

## Context
The user works on **several businesses at once** and needs each one's artifacts (narrative,
generated capabilities, model/effort prefs) kept together under a project name and to survive
reloads. ADR-002 names **git-backed workspaces** as the eventual source of truth, but that needs
service endpoints + git plumbing (a later milestone). The MVP needs "very light" project
management now.

## Decision
For the MVP, store projects **client-side in `localStorage`** (key `vbd.projects`), managed
entirely in `apps/web`. A project = `{ id, name, narrative, model, effort, capabilities?,
provider?, updatedAt }`. The app provides create / rename / delete / switch, seeds a solar
example on first run, and persists on every edit. The service stays **stateless** (generation
only) — no server persistence yet.

## Alternatives considered
- **Server + git-backed workspaces now (ADR-002).** The right long-term home, but heavier than
  "very light"; deferred. localStorage buys the UX immediately with zero backend work.
- **A database.** Rejected — same trap ADR-002 rejects (DB-as-truth) and overkill for the MVP.

## Consequences
- (+) Immediate multi-project UX, offline, no backend. Survives reloads.
- (−) **Browser-scoped** — not shared across devices/browsers, and cleared if site data is wiped.
  Acceptable for a single-user MVP; flagged in-product is unnecessary but noted here.
- (−) Two eventual sources of truth to reconcile → **migration path:** when the service grows a
  git-backed workspace API (ADR-002), add an export/import so localStorage projects seed real
  workspaces; localStorage then becomes a cache, not the truth.

## Follow-ups
- `apps/web/src/projects.ts` — typed store + load/save + templates.
- Later: `apps/service` workspace CRUD (git) + a one-way import of localStorage projects.
