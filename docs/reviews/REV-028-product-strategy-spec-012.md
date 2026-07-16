---
id: REV-028
title: SPEC-012 review — product-strategy lens
type: review
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-15
updated: 2026-07-15
reviews: SPEC-012
lens: product-strategy
verdict: Approve-with-changes
---

# REV-028 — SPEC-012, product-strategy

**Verdict: Approve-with-changes.** The design is sound and respects the golden invariants; the objection
is framing — the first cut sold a user-facing "any constituent, any location, any combination" story that
Phase 2a does not deliver (no UI, agents not unified, no provisioning) and sequenced it ahead of the RLS
gap that makes remote placement safe.

## Findings

1. **[Major] `agentRuntime`↔`hosting` reconciliation claimed, not implemented** — agents remained a
   parallel, un-unified placement channel. → **Fixed:** `resolvePlacement` maps a non-`node` agent runtime
   to a managed placement; §4.1 now accurate; test added.
2. **[Major] Phase 2a is JSON-only / developer-only, not framed honestly** for a non-technical end user. →
   **Fixed (framing):** §1 "Scope honesty" + §8 state the beneficiary is the export consumer/self-hoster;
   the end-user editor is Phase 2b.
3. **[Major] Sequencing: descriptors that don't provision are lower-leverage than the RLS/tenant gap, which
   managed placement makes riskier.** → **Fixed (warn) + Accepted:** §7 records the risk; `PLACEMENT.md`
   warns on a managed store; the RLS/tenant model remains the real blocker for production remote deploys,
   tracked outside this spec.
4. **[Minor] Inconsistent target granularity (provider-specific vs generic).** → **Fixed:** §4.2 states the
   rule — provider-specific targets only where a committed config file is needed; else generic `managed`.
5. **[Minor] Registry-demand not justified.** → **Fixed:** §4.6 notes the spine/UI provider targets are the
   evidence the registry earns its keep.
6. **[Nit] Four overlapping binding axes risk author confusion.** → **Accepted** — the eventual Phase 2b
   editor is the disambiguation surface; `deployment.json` gives the resolved picture.

## Closure
Framing and reconciliation fixed; sequencing risk surfaced honestly. No Blocker. Verdict satisfied.
