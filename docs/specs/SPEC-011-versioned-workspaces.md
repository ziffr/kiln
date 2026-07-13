---
id: SPEC-011
title: Versioned Workspaces — git-backed model history + semantic diff
type: spec
status: Draft
version: 0.1.0
author: Claude (Opus 4.8)
created: 2026-07-13
updated: 2026-07-13
supersedes: null
related: [ADR-002, ADR-006, SPEC-001]
reviewers: []
---

# SPEC-011 — Versioned Workspaces

## Context

Kiln Studio has **no version history**. Projects persist as a `project.json` in a filesystem
workspace (ADR-006) or in `localStorage`, and the whole model round-trips as `model.json` — but
in-app there are no snapshots, no restore, and no diff. Regenerating a layer **destroys** the prior
state. Users cannot iterate safely or see how a model evolved.

ADR-002 already names **git-backed workspaces as the eventual source of truth**, and ADR-006 already
puts each project in its own directory under `data/workspaces/<id>/`. This spec realizes that: each
workspace becomes a **git repository**, so history, restore, and diff fall out of a proven substrate
rather than a bespoke store.

## Decision

Each workspace directory (ADR-006) is a **git repo**. Saving a version is a **commit**; history is
`git log`; restoring is writing a past `project.json` back as the working state; diff compares two
commits' models. A new **semantic model-diff** engine turns two `model.json`s into a human-readable,
per-layer change list (not a text diff).

### Persistence & the serverless constraint (resolved by precedent)

Git needs a **persistent filesystem** — it runs in the standalone `apps/service`, not in the hosted
Vercel serverless functions (ephemeral FS). This is **exactly** ADR-006's existing behavior: the
server store is the source of truth *when reachable*, with `localStorage` as the offline fallback.
Versioned workspaces inherit that contract:

- **Persistent backend reachable** → full version control (timeline, restore, diff) via the service.
- **No backend (hosted demo / offline)** → graceful degradation to today's behavior: the model.json
  **export/import** remains the portable, git-committable unit. The UI hides history when the
  workspace API is absent (feature-detected), never erroring.

No new invariant is broken: text/model stays the source of truth; git is a durable projection of it.

## Architecture

### Server — workspace git API (`apps/service`)
A `workspaceGit` module wrapping git (via `node:child_process` `execFile`, arg arrays — no shell) on
`data/workspaces/<id>/`:

- On `PUT /api/projects/:id` (existing save) → write files, then **commit** (`git add -A && git
  commit`) with a message carrying the label + app/schema version in the body. `git init` on first
  save (name/email from a Kiln identity fallback, like the exporter).
- `GET  /api/projects/:id/versions` → history: `[{ sha, label, message, at, appVersion }]` from `git log`.
- `GET  /api/projects/:id/versions/:sha` → the full project/model at that commit (`git show`).
- `POST /api/projects/:id/restore` `{ sha }` → write that version back as the working tree + commit
  a "restore vN" marker (non-destructive: the restored-over state stays in history).
- `GET  /api/projects/:id/diff?from=:sha&to=:sha` → the semantic model diff (below).

Manual **"Save version"** sends an explicit label; **auto-snapshot** commits on each successful
Generate with a derived label (e.g. "generated: behaviour"). Auto-snapshots are squashable later.

### Pure engine — semantic model diff (`@kiln/…`, isomorphic)
`diffModels(a, b) → ModelDiff`: per layer (capabilities, areas, entities+attributes, behaviour,
automations, roles, workflows, agents), classify each element **added / removed / changed** by stable
id, with changed-field detail for entities (attributes) and workflows (steps/mode). Pure, dependency-
free, unit-tested (`packages/*/test`), reused by both the API diff endpoint and the in-app diff view.

### Web — version timeline + restore + diff
- A **Versions** panel (sidebar/footer, next to the app-version badge): the timeline of the current
  project, each entry = label · relative time · app version, with **Restore** and **Compare**.
- **Compare** two versions → a **diff view** grouping changes by layer (＋added ／−removed ／~changed),
  each row click-through to the artifact (reusing existing cross-navigation).
- Feature-detected: the panel appears only when the workspace API answers; otherwise the existing
  Export/Import model remains the manual version story.

## Staged plan

- **M1 — server git substrate:** `workspaceGit` + commit-on-save + `/versions` + `/versions/:sha`.
  Exit: saving twice yields two commits; history lists them.
- **M2 — restore:** `/restore` + the timeline UI with Restore. Exit: restore round-trips a prior model.
- **M3 — diff engine:** `diffModels` + tests (seeded add/remove/change across every layer).
- **M4 — diff view:** `/diff` endpoint + the in-app Compare view, click-through to artifacts.
- **M5 — auto-snapshot + labels:** commit on Generate; manual "Save version" naming; squash controls.

## Invariants & interplay
- **ADR-002 (text is truth):** git stores the authored `project.json` + `narrative.md`; the repo is a
  durable projection, not a second truth. Restore rewrites the working model, which re-derives views.
- **ADR-006 (server store):** this extends it (dir → repo); the server-when-reachable / local-fallback
  contract is unchanged.
- **Invariant #4 (isomorphism):** the diff engine is pure/isomorphic (no `node:*`); only the service's
  `workspaceGit` touches git.

## Open questions (for review)
1. Auto-snapshot on *every* Generate vs only on explicit save + a "checkpoint before regenerate"? (M5)
2. Retention: cap auto-snapshots / offer squash, or keep all (git is cheap)?
3. Branching (explore-a-variant) — in scope later, or export/import a fork for now?
4. Does the hosted studio warrant a non-git durable history (e.g. a DB-backed commit log) so version
   control works there too, or is "persistent backend only" acceptable for v1?
