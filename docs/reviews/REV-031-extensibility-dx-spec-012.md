---
id: REV-031
title: SPEC-012 review — extensibility / developer-experience lens
type: review
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-15
updated: 2026-07-15
reviews: SPEC-012
lens: extensibility-dx
verdict: Approve-with-changes
---

# REV-031 — SPEC-012, extensibility / developer-experience

**Verdict: Approve-with-changes.** The registry mirrors SPEC-010 faithfully and the primary path (a new
provider over an existing engine) delivers "one file + one register line". But the headline **cross-seam
composition with SPEC-010 broke** — a third-party engine was silently unplaceable — and the seam-URL
payoff was unbuilt and the exporter's placement branch untested.

## Findings

1. **[Blocker] A third-party engine (SPEC-010) had no placement story.** `managed.hosts` was a hardcoded
   `{postgres,n8n,odoo}` allowlist; `ENGINE_URL_ENV`/compose blocks hardcoded the six built-ins — so a novel
   engine required core edits and, worse, resolved to a silent no-op (clean validation, no artifacts). →
   **Fixed:** `managed.hosts = mode==="managed"` (generic); `Engine` gained optional `urlEnv`/`composeService`;
   `resolvePlacement`/`projectPlacement` consult the engine registry first; `DeployContext.composeService`
   carries the resolved service name. Test: a `clickhouse` engine placed managed emits reach var + prune +
   row, no core edit. Novel-engine *local* compose-service generation is explicitly deferred to 2b.
2. **[Major] §4.3 seam-URL parameterization unimplemented** (n8n still points at `spine.local`). → **Fixed
   (descope):** reclassified as Phase 2b; the spec no longer over-claims it.
3. **[Major] No test proved a DeployTarget flows end-to-end through `assembleFullStack`.** → **Fixed:**
   `fullstack-placement.test.ts` drives a remote binding through the real assembly.
4. **[Major] `DeployOutput.note` was a raw markdown table row** (a target had to know PLACEMENT.md's column
   format). → **Fixed:** replaced by a structured `reach` cell; the projector renders the table.
5. **[Minor] `ENGINE_COMPOSE_SERVICE` was dead code.** → **Fixed:** now consulted (via `composeServiceOf`)
   as the compose-service source, including for third-party engines.
6. **[Minor] `agentRuntime`↔`hosting` reconciliation claimed, not implemented.** → **Fixed** (see REV-028 #1).
7. **[Minor] Authoring DX: raw JSON, no schema/target-id enumeration.** → **Partially fixed:** docs enumerate
   the target ids + `HostingSpec` shape; PB1–PB5 surface in the shared validation channel. A JSON Schema
   file is **Deferred** to the Phase 2b editor work.
8. **[Nit] `validatePlacement` hardcoded `dialect: "postgres"`.** → **Fixed:** dialect threaded through.

## Closure
The Blocker is resolved — third-party engines are placeable (managed/remote) with no core edit, tested;
the seam-URL over-claim is descoped; the exporter path is tested; the contract is markdown-free. No
Blocker/Major remains. Verdict satisfied.
