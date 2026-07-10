---
id: ADR-006
title: Server-side project persistence — filesystem workspace store in the service
type: adr
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-10
updated: 2026-07-10
supersedes: ADR-005
related: [ADR-002, ADR-005, ADR-003]
---

# ADR-006 — Server-side project persistence

## Status
Approved. Realizes the migration path ADR-005 promised: projects move from browser-only
localStorage to a server-side store, with localStorage demoted to an offline cache.

## Context
ADR-005 stored projects in `localStorage` (browser-scoped: not shared across devices/browsers,
lost if site data is cleared). The user works across sessions and wants projects to persist
server-side. ADR-002 names git-backed workspaces as the eventual source of truth.

## Decision
The **service (`apps/service`) owns project persistence** as a **filesystem workspace store**:
- Each project is a directory under a gitignored `data/workspaces/<id>/`:
  - `business/narrative.md` — the authored narrative (ADR-002: text is the source of truth).
  - `project.json` — full project state (name, model, effort, capabilities, coachConfig,
    coachTranscript, provider, updatedAt) for straightforward round-trip.
- New API: `GET /api/projects`, `PUT /api/projects/:id`, `DELETE /api/projects/:id`.
- **The web app treats the server as the source of truth when reachable**, and keeps
  `localStorage` as an **offline cache + one-time import source**: on load it fetches the server
  list; if the server is empty but local projects exist, it imports them; if the server is
  unreachable, it falls back to localStorage. The active-project selection stays a client
  preference (localStorage).
- Project ids are sanitized before use as a path segment (traversal safety).

## Alternatives considered
- **Git commit per save (full ADR-002).** Deferred: valuable for versioning/blame, but heavier;
  the filesystem store is the pragmatic first step. Follow-up: `git init` the `data/` dir and
  commit on save, or expose per-project history.
- **A database.** Rejected (same reason ADR-002 rejects DB-as-truth); files are diffable and
  git-ready.
- **Keep localStorage only.** Rejected — the whole point is cross-session/device persistence.

## Consequences
- (+) Projects persist server-side; survive browser resets; a cleared browser re-hydrates from
  the server. Offline still works via the localStorage fallback.
- (−) Data lives under gitignored `data/` (not versioned yet) — git-per-save is the follow-up
  toward full ADR-002.
- (−) The web app now has a small sync layer (server-primary, local-fallback, debounced writes).
- Single-user/local-tool assumption holds (no auth/multi-tenant yet; N3 in SPEC-001).

## Follow-ups
- `git init` `data/` + commit-on-save (or per-project history) to complete ADR-002.
- Conflict handling if the same project is edited from two clients (out of scope for single-user).
