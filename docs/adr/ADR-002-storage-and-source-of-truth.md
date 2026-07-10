---
id: ADR-002
title: Storage & source-of-truth model — git authored text, derived cache, SQLite history
type: adr
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-10
updated: 2026-07-10
supersedes: null
related: [SPEC-001, REV-002, REV-005]
---

# ADR-002 — Storage & source-of-truth model

## Status
Approved. Ratifies SPEC-001 §3, §6.1, §12 Q3, endorsed by REV-002 (F3, F9) and REV-005 (F5).

## Context
VBD's central invariant is **"text is the source of truth; everything else is a projection."**
This must be enforceable by construction, not discipline. Three kinds of state exist:
1. **Authored artifacts** — `narrative.md`, `capabilities.yaml`, `annotations.yaml`. The truth.
2. **Derived artifacts** — `narrative.json`, `ir.json`, review outputs, layout. Recomputable
   from (1).
3. **Operational history** — review runs, eval runs, metrics. Append-only, queryable, not truth.

Open questions this resolves: what is committed to git vs regenerated; whether a database is
needed; how to prevent derived state from silently becoming authoritative.

## Decision
1. **Git is the store for authored artifacts.** Every mutation is a commit. The working set of
   `*.md` / `*.yaml` under `business/`, `model/` is the only source of truth.
2. **Derived artifacts live under `.vbd/` and are gitignored, rebuildable, and never an input.**
   They are a cache. On load, `buildHash` is verified; on mismatch the cache is discarded and
   recompiled (REV-005 F5). The compiler may read only authored files.
3. **SQLite is a derived, non-authoritative cache** for operational history (review/eval runs,
   finding lifecycle queries). It can be deleted and rebuilt from git-tracked `annotations.yaml`
   + re-runs. It is never the source of truth for the model (REV-002 F9).
4. **Authored/derived typing propagates into the IR** (SPEC-001 §3.3): only `authored` nodes/
   edges round-trip to text; `derived` ones are read-only. Layout positions are computed, never
   persisted.
5. **Machine vs human provenance:** LLM-authored changes are committed with an attributable
   author (`skill@version`) recording `modelId` + prompt hash (REV-005 F6).

## Alternatives considered
- **Database as primary store.** Rejected: breaks text-as-truth, loses diffability/versioning,
  and is the exact trap (canvas/DB-as-truth) that sinks low-code platforms.
- **Commit derived artifacts to git.** Rejected: creates two sources of truth and noisy diffs;
  `ir.json` is a build output.
- **No SQLite (git/JSON files for history too).** Rejected for history only: querying review/
  eval runs over time is painful in flat files; SQLite stays optional and rebuildable.

## Consequences
- (+) One enforceable truth; full diff/version/blame on the model; derived state is disposable.
- (+) `buildHash` + `dirty` flag give a deterministic staleness signal (SPEC-001 §3.4).
- (−) Must implement cache-invalidation + a migration path for authored schema evolution
  (SPEC-001 §3.2 versioned migrations).
- (−) SQLite adds a (rebuildable) moving part; kept out of the truth path to bound risk.

## Follow-ups
- `@vbd/store` package: git read/write + `.vbd/` cache management + buildHash verification.
- Migration registry keyed on `capabilities.yaml` `version`.
