---
id: REV-032
title: Technical-architecture review of SPEC-013
type: review
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-17
updated: 2026-07-17
reviews: SPEC-013
lens: technical-architecture
verdict: Approve-with-changes
related: [SPEC-013]
---

# REV-032 — SPEC-013, technical-architecture lens

**VERDICT: Approve-with-changes.** Direction sound; honors #6/#7. Before Approved, resolve where the auth-resolution seam and connector runtime dispatcher live, define the op→schema projection and grant normalization, and be honest about runtime-template branching.

- **[TA1] Major** — `nango` auth doesn't fit the sync `ExternalAuth` union / `externalAuthHeaders` (a pure sync `env→Record<string,string>`). Nango needs an async network call at request time. FIX: model Nango as a **separate async auth-resolver seam** (`resolveConnectorAuth(binding): Promise<Headers>`), leave `externalAuthHeaders` untouched, specify the `ToolDef.auth`→resolver mapping.
- **[TA2] Major** — "registry mirroring SPEC-010" conflates a build-time registry with a runtime dispatcher and never defines `ConnectorAdapter`. `executeTool` is a hardcoded `switch(tool.kind)` in emitted code — no runtime plugin point. FIX: define `ConnectorAdapter` concretely; state where each half lives (codegen-time registered vs emitted runtime dispatcher).
- **[TA3] Major** — `direct` = Kiln owning ~12 vendor REST clients (strains #8); and `execution:"n8n"` does NOT "reuse the SPEC-009 seam" (services.ts emits `httpRequest`, not native Gmail/Sheets nodes — native-node emission is new codegen). FIX: make n8n-native the default; scope/cap `direct`; correct §4.4.
- **[TA4] Major** — op→tool projection under-specified: `AgentTool`/`agentToolParams` only know `input?: string[]` + a fixed `kind` switch → folded ops hit `default` and lose typed I/O; unnamespaced op names collide (`uniqueToolName` silently suffixes → corrupts refs); `output` has no consumer. FIX: add a `connector` `AgentToolKind` + `AttributeSpec[]`→schema branch; namespace tool names `<toolId>_<op>`; give `output` a consumer or drop it.
- **[TA5] Major** — top-level `toolGrants[]` keyed by `agentId` de-normalizes the agent's authored state (#1/#2). FIX: nest `grants` on `AgentInput`; keep only `ToolDef[]` as the new top-level layer.
- **[TA6] Minor** — byte-identity shown only for `.env.example`, not the emitted runtime templates (def/auth/tools). FIX: emit extended templates only when ≥1 connector granted; state it + test rationale.
- **[TA7] Nit** — `meta: Provenance` "authored | grounded" — `Origin` is `authored | derived`; "grounded" is a source, not an origin. FIX: `origin:"authored"`; keep grounding in `derivedFrom`.
