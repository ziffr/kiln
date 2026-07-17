---
id: REV-034
title: Product-strategy review of SPEC-013
type: review
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-17
updated: 2026-07-17
reviews: SPEC-013
lens: product-strategy
verdict: Approve-with-changes
related: [SPEC-013]
---

# REV-034 — SPEC-013, product-strategy lens

**VERDICT: Approve-with-changes.** The `ToolDef` + per-agent-grant abstraction is the durable, on-thesis contribution (declaration, not execution). The scope drift is the muscle: Nango, `direct`, and a 10-integration catalog. Simpler ~80% framing: **agent tool grants that compile to n8n connector nodes** — brain-side grants, borrowed muscle, one connector, zero new dependency.

- **[PS1] Major** — no demand signal; violates the team's own "get a signal before the next layer" discipline (SPEC-005 was shelved for exactly this). FIX: add a §0 demand-signal gate; trim to Phase A + one thin n8n proof; HOLD the catalog + grant UI until a partner needs a live-operating agent.
- **[PS2] Major** — Nango + `direct` premature; the `n8n` path already delivers ~80% with zero new dependency (n8n brokers OAuth via its credential store). Self-hosters shouldn't need Kiln + n8n + Nango + DB to read an inbox. FIX: ship `execution:"n8n"` only; keep `nango`/`direct` as a named future extension. (Flips D2.)
- **[PS3] Major** — the 5×2 catalog is iPaaS surface-area + a maintenance liability (every vendor API change becomes Kiln's bug). FIX: ship the registry seam + exactly one proof connector; frame the catalog as community/n8n-provided.
- **[PS4] Major** — "Email first" is the highest-risk debut (inbox content = prompt-injection into the LLM). FIX: make **Spreadsheet** the Phase-B proof (lower blast radius, already in the solar fixture); if Email, build the injection treatment (content-as-DATA, read-then-human-gate) into the proof.
- **[PS5] Minor** — no anti-over-suggestion metric though it's a named risk. FIX: add `spuriousSuggestionRate` (mirror SPEC-005 `spuriousRate`).
- **[PS6] Nit** — D3 (reuse `AttributeSpec`): endorse (subject to the DX6 I/O-vocab gap).

**Decisions:** D1 → Spreadsheet; D2 → n8n-first (reverse the draft); D3 → reuse `AttributeSpec`.
