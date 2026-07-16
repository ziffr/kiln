---
id: REV-030
title: SPEC-012 review — security-data lens
type: review
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-15
updated: 2026-07-15
reviews: SPEC-012
lens: security-data
verdict: Approve-with-changes
---

# REV-030 — SPEC-012, security-data

**Verdict: Approve-with-changes.** Intent is sound — descriptors-only, `deploy/` is pure, nothing secret
reaches the browser. The one systemic issue: `hosting.url` was an unenforced credential-into-git channel.

## Findings

1. **[Major] A credential-bearing `hosting.url` (a DSN `//user:pass@host/db`) landed verbatim in three
   committed files** (`.env.example` as an uncommented assignment, `PLACEMENT.md`, `deployment.json`);
   "never a secret" was a comment, not a guard. → **Fixed:** validator **PB5** (reject userinfo); userinfo
   redacted from every artifact **and** the `model.json`/`_run.json` binding echo; managed `env` is a
   commented placeholder. Test: a credentialed url leaks into no file.
2. **[Minor] `managed` was the outlier emitting an uncommented `NAME=value` reach line** (vs `vercel`/`fly`
   which comment theirs). → **Fixed:** all reach lines are commented placeholders.
3. **[Minor] Managed-store pruning points the `USING(true)` RLS gap at a real DB; `PLACEMENT.md` was
   silent.** → **Fixed:** `PLACEMENT.md` emits an RLS warning when a store is managed; §7 records the risk.
4. **[Minor] §2 non-goal hand-waved the exposure its own `url` field created.** → **Fixed:** §2 now states
   `url` is a scheme+host hint, credentials rejected (PB5) and never written.
5. **[Nit] PB1 largely dead for known engines.** → **Accepted** — documented; PB2 covers the real cases.

Solid: `deploy/` purity, sorted registry, `fly`'s `fly secrets` discipline, byte-identical default.

## Closure
The `url` credential channel is closed by PB5 + defence-in-depth redaction; managed-store RLS risk is
surfaced. No Blocker. Verdict satisfied.
