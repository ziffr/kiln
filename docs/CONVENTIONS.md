---
id: CONV-001
title: Documentation Conventions & Policy
type: policy
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-10
updated: 2026-07-10
supersedes: null
related: []
---

# Documentation Conventions & Policy

This file is the **single source of truth** for how planning documents, specifications,
reviews, and decisions are stored and formatted in this repository. All document
generation — by humans or agents — MUST obey this policy.

## 1. Directory structure

```
docs/
├── CONVENTIONS.md          # this file (the policy)
├── INDEX.md                # generated index of all docs + their status
├── plans/                  # PLAN-*  roadmaps, phase plans, execution plans
├── specs/                  # SPEC-*  product/technical specifications
├── reviews/                # REV-*   independent review reports
├── adr/                    # ADR-*   architecture decision records
├── research/               # RES-*   research notes, explorations, spikes
└── templates/              # reusable frontmatter/body templates
```

New document types get their own subdirectory + ID prefix and are added here first.

## 2. File naming

`<PREFIX>-<NNN>-<kebab-slug>.md`

- `PREFIX` ∈ {PLAN, SPEC, REV, ADR, RES}
- `NNN` = zero-padded sequence within that type (001, 002, …), never reused
- Example: `docs/specs/SPEC-001-mvp-narrative-capability-loop.md`
- A review of SPEC-001 by the "architecture" lens: `docs/reviews/REV-002-architecture-spec-001.md`

## 3. Required frontmatter

Every document MUST begin with YAML frontmatter:

```yaml
---
id: SPEC-001                       # unique, matches filename prefix+number
title: Human readable title
type: spec | plan | review | adr | research | policy
status: <see status lifecycle>
version: 0.1.0                     # semver; bump on material change
author: <name/agent>
created: YYYY-MM-DD
updated: YYYY-MM-DD                # bump on every edit
supersedes: <id or null>          # if it replaces an older doc
related: [ID, ID]                 # cross-references
reviewers: [lens names]           # for specs/plans: who reviewed it (optional)
---
```

Reviews add: `reviews: <target-id>`, `lens: <perspective>`, `verdict: <Approve|Approve-with-changes|Reject>`.

## 4. Status lifecycle (MANDATORY on every document)

```
Draft ─▶ In Review ─▶ Changes Requested ─▶ Revised ─▶ Approved ─▶ Superseded
                                             │                      ▲
                                             └──────(re-review)─────┘
```

| Status | Meaning |
|---|---|
| `Draft` | Being written; not yet ready for review. |
| `In Review` | Under active review by one or more reviewers. |
| `Changes Requested` | Reviewers returned findings that must be addressed. |
| `Revised` | Author addressed findings; awaiting re-review or sign-off. |
| `Approved` | Passed review / closure reached. Stable. |
| `Superseded` | Replaced by a newer document (see `supersedes` in the replacement). |
| `Deprecated` | No longer relevant; kept for history. |

**Closure rule:** a spec/plan reaches `Approved` only when every reviewer lens has
returned `Approve` or `Approve-with-changes` AND all `Approve-with-changes` items are
either resolved in the doc or explicitly logged as accepted/deferred in its
"Review & closure" section.

## 5. Review process

1. Author writes the doc → `Draft`, then flips to `In Review`.
2. Independent reviewers (subagents or humans), **each a distinct perspective/lens**,
   produce a `REV-*` report with a `verdict` and itemized, severity-tagged findings
   (Blocker / Major / Minor / Nit).
3. Author addresses findings; doc → `Revised`; a "Review & closure" section logs the
   disposition of every finding (Fixed / Accepted / Deferred + rationale).
4. Re-review the Blockers/Majors until none remain → doc → `Approved`.

## 6. Index

`docs/INDEX.md` lists every document with id, title, type, status, version. It is
regenerated whenever a document is added or changes status.

## 7. Agent obligation

Any agent generating a plan/spec/review/decision/research doc in this repo MUST:
place it in the correct subdirectory, use the correct prefix + next free number,
include complete frontmatter with a valid `status`, and update `docs/INDEX.md`.
