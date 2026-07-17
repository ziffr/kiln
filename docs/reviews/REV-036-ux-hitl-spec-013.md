---
id: REV-036
title: UX-HITL review of SPEC-013
type: review
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-17
updated: 2026-07-17
reviews: SPEC-013
lens: ux-hitl
verdict: Approve-with-changes
related: [SPEC-013]
---

# REV-036 — SPEC-013, ux-hitl lens

**VERDICT: Approve-with-changes.** The derived read-only Contract tab + TC4 (ungranted op = fabrication) are good HITL alignment. But §4.8 is one paragraph governing the highest-stakes surface in the product (handing live credentials to an autonomous agent) while borrowing the zero-authority enrich idiom. All findings live in that gap.

- **[UX1] Blocker** — §4.8 collapses two consent acts: authoring a grant vs authorizing live OAuth to a real account. FIX: split into (1) grant connector+ops (reversible model edit, no real-world effect) and (2) a separate, deliberately-confirmed "Connect a live account" step naming the provider + real account + scopes. Never let (2) ride on (1)'s checkbox.
- **[UX2] Blocker** — no readiness state distinguishing "granted, no live connection" from "wired" (Contract tab is read-only, Runs are MOCK-badged → a granted-but-unconnected connector looks operational, violating honest-readiness). FIX: explicit shape+text status `granted (no live connection) / connected / error`, from a real connection check, shown per grant and rolled up.
- **[UX3] Major** — reusing the enrich accept/decline idiom (which ships "⚡ Auto = accept-all") normalizes over-granting of live authority (cookie-banner anti-pattern; contradicts #6). FIX: forbid any bulk/auto-accept "grant all" for connectors; require per-grant deliberate confirmation; state the enrich *visual* is reused but the one-click/auto path is not.
- **[UX4] Major** — no revoke / cross-agent audit story. FIX: a revoke affordance per grant + state plainly what it does to the live Nango connection (does the token survive?); a per-project "granted authority" view (agent×connector×op×connection).
- **[UX5] Major** — the connection's real OAuth scope (true blast radius) is invisible; `scopes` is per-op/"informational" only. FIX: surface the bound connection's actual granted scopes (from Nango), warn when they exceed what the granted ops need.
- **[UX6] Minor** — a flat op multi-select treats read-only and world-writing ops as equal checkboxes (the "flat equal list" the owner already redesigned away). FIX: group/mark by `kind`, separate write/send, on-demand "what this lets the agent do" per op.
- **[UX7] Minor** — HITL at test time undefined (Runs are mock, connectors live). FIX: default test runs to mock; a clearly-labeled, separately-consented "run against the live connection" mode; badge live steps distinctly.
- **[UX8] Nit** — a11y unstated for the new surfaces. FIX: aria for the multi-select + status; connected/not signal must carry shape/text, not color alone.
