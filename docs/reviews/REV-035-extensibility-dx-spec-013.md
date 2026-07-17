---
id: REV-035
title: Extensibility-DX review of SPEC-013
type: review
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-17
updated: 2026-07-17
reviews: SPEC-013
lens: extensibility-dx
verdict: Reject
related: [SPEC-013]
---

# REV-035 — SPEC-013, extensibility-dx lens

**VERDICT: Reject.** Direction and invariant-fit are right, but the extensibility mechanism this lens exists to check is asserted rather than specified (DX1), self-contradictory (DX2/DX5), and non-executable as declared (DX3). All fixable by porting SPEC-010's contract-grade rigor into §4.5/§4.7 + adding a one-file-no-core-edit acceptance probe.

- **[DX1] Blocker** — `ConnectorAdapter` is never defined (appears once, in §4.5). No interface, signature, context, or output shape — contrast SPEC-010's fully-specified `EngineAdapter`/registry. A contributor cannot build against a non-existent interface. FIX: add a real `ConnectorAdapter` contract + `registerConnector`/`getConnectorAdapter`/`registeredConnectors` + a `connectors/index.ts` registration pattern.
- **[DX2] Blocker** — §4.5 ("no edits to core dispatch") contradicts §4.7 (core `connectors.ts` emits per-connector runtime; `auth.ts` gains the resolver — both core edits, per connector). No acceptance probe (SPEC-010's closure hinges on one). FIX: decide per-connector-adapter-file (open) vs central switch (closed); add the SPEC-010-grade probe ("add Salesforce as one registered file, no core-dispatch edits, byte-identical when ungranted").
- **[DX3] Major** — `ToolDef` carries no execution knowledge (no base URL / method / path for `direct`; no node id / op for `n8n`), so it can't run either path, yet is called "declarative." FIX: either extend `operations[]` with an execution binding (`http?:{...}` / `n8n?:{node,op,params}`), or make `ConnectorAdapter` own the glue and demote `ToolDef` to grant-surface metadata — state which.
- **[DX4] Major** — unresolved overlap: connector `email.send` vs the existing comms `email` channel; connector `direct`+`credentialEnv` vs the existing external-service delegate (CRM appears in both). Three ways to reach an external system, no decision rule. FIX: state a sharp distinguishing rule (or unify external-service into connectors); say whether an Email connector retires the comms email path for that agent.
- **[DX5] Major** — curated catalog (§2/§7) vs open registry (§4.5) is self-contradictory. FIX: pick one — recommend open (match SPEC-010) and drop the "curated/exotic→external-service" framing, or drop the "register one adapter, no core edits" claim.
- **[DX6] Major** — `AttributeSpec` (flat `{name,type}`) is too weak for real connector I/O (Email thread→messages, `read_range` 2-D grid, CRM arbitrary fields) — every non-CRUD op's shape is inexpressible, so D3's "reuse AttributeSpec" is a fiction the runtime ignores. FIX: extend I/O vocab with `array`/`object`/`json`/`raw`, or scope connectors to flat-record ops and say so.
- **[DX7] Minor** — op `kind` (`read|list|write|send`) is under-justified: no `delete`/`archive`; unclear what `kind` drives; a second taxonomy beside `AgentToolKind` with no reconciliation. FIX: state what `kind` drives; add `delete`/`action`; map connector `kind` onto/replacing `AgentToolKind`.
