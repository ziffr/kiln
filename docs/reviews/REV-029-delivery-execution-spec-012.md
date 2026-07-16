---
id: REV-029
title: SPEC-012 review — delivery-execution lens
type: review
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-15
updated: 2026-07-15
reviews: SPEC-012
lens: delivery-execution
verdict: Approve-with-changes
---

# REV-029 — SPEC-012, delivery-execution

**Verdict: Approve-with-changes.** The isolated unit tests were clean, but the two safety nets the spec
leans on hardest — byte-identity-when-unset and `deploy/` isomorphism — were both *claimed* and neither
*enforced* by a committed test. Both Major (silent future regression). No Blockers.

## Findings

1. **[Major] Byte-identical-when-unset has no automated regression test** (`fullstack.test.ts` only asserts
   `run()===run()`). → **Fixed:** `fullstack-placement.test.ts` snapshots the all-local `docker-compose.yml`
   against a captured baseline + asserts empty-hosting changes no placement-sensitive file, both dialects.
2. **[Major] `invariants.test.ts` does not scan `deploy/`** — the isomorphism claim was false. → **Fixed:**
   `packages/codegen/src/deploy` added to `pureDirs` (one line); the claim is now enforced.
3. **[Major] A `managed` engine no generic target hosts passes validation but exports local.** → **Fixed:**
   generic `managed` hosts it; PB2 fallback check added; tests cover it.
4. **[Minor] Empty `services:` → broken YAML reachable via a fully-managed odoo binding.** → **Fixed:** guard
   + test asserting non-empty `services:`.
5. **[Minor] No e2e exercising `assembleFullStack` with a `hosting` binding.** → **Fixed:** e2e case (managed
   pg + fly spine + vercel ui) asserts prune/env/descriptors.
6. **[Minor] Untested branches: `selfhost`, sqlite+placement, odoo-prune.** → **Partially fixed:** sqlite
   byte-identity + placement covered; `selfhost`/odoo-prune-through-projection **Deferred** (low risk, pure).

Docs discipline verified PASS (versioned mirror present); determinism + round-trip confirmed.

## Closure
The two load-bearing guarantees are now enforced by committed tests; the silent-local path errors. No
Blocker. Verdict satisfied.
