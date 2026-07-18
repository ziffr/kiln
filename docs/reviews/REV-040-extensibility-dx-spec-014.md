---
id: REV-040
title: Extensibility-DX review of SPEC-014
type: review
status: Approved
version: 1.1.0
author: Claude (Opus 4.8)
created: 2026-07-18
updated: 2026-07-18
reviews: SPEC-014
lens: extensibility-dx
verdict: Reject → Approve-with-changes (re-reviewed)
related: [SPEC-014]
---

# REV-040 — SPEC-014, extensibility-dx lens

**VERDICT: Reject.** The lifecycle design (outbox, durable state, suspend/resume) is sound and its
invariant-fit (#8) is careful — but the wake mechanism that this lens exists to check is **not a seam at
all**: there is no `WakeSourceAdapter`, no registry, no probe, and D6 explicitly demotes the wake source
to a hardcoded 3-value enum auto-picked in core. A contributor cannot add Temporal/Redis/SQS/a
cloud-scheduler without editing core dispatch — a straight regression from the SPEC-010/013 bar, and the
exact class of defect this lens Rejected SPEC-013 v0.1 for (REV-035 DX1/DX2).

- **[DX1] Blocker** — **No `WakeSourceAdapter` contract or registry exists.** §2 claims "three sources,
  one swappable axis (mirrors SPEC-013's `execution` axis)," but SPEC-010/013's whole mechanism — a
  concrete adapter interface + `register*/get*/registered*` (sorted→deterministic) + side-effect
  registration in an `index.ts` — is nowhere. The three sources (`postgres`/`in-process`/`n8n`) are a
  fixed enum resolved by a hardcoded switch (§4.4/D6). Temporal, Redis Streams, SQS, a cloud scheduler —
  precisely the "new orchestrators/backends" SPEC-010 was built to admit — cannot be added without core
  edits. This is REV-035 DX1 verbatim: the extensibility mechanism is asserted, not specified. FIX:
  define `interface WakeSourceAdapter { source: WakeSource; applies?(ctx): boolean; emit…/resume… }` in
  a `packages/codegen/src/wake/` registry (`registerWakeSource`/`getWakeSource`/`registeredWakeSources`,
  sorted by id), built-ins registering themselves in `wake/index.ts` — byte-for-byte the engines/
  connectors idiom.

- **[DX2] Major** — **D6 conflates "not a user knob" with "not a contributor seam."** Auto-picking the
  wake source for the owner by deployment shape (good UX, keep it) does *not* require the *set* of wake
  sources to be closed. The spec collapses a UX decision (don't expose a binding dimension) into an
  architecture decision (no registry), and loses extensibility as a silent side effect. You can
  auto-pick from a registry. FIX: keep D6's auto-pick, but make it a `selectWakeSource(shape)` resolver
  choosing *from* `registeredWakeSources()`; a registered third-party source can declare the shape(s) it
  serves and participate in selection.

- **[DX3] Major** — **No acceptance probe.** §6 tests correctness of the three built-ins (round-trip,
  no-double-fire, LISTEN recovery, AL-recall) but contains nothing proving one-file-no-core-edit
  extension. SPEC-010's closure hinged on the fake-`mysql` probe; SPEC-013's on the second-connector
  probe; REV-035 DX2 Rejected SPEC-013 partly for its absence. FIX: add the probe — "register a fourth
  wake source (e.g. `redis`) as one file, assert zero core-dispatch edits and byte-identical export when
  it is not the selected source" — as the extensibility acceptance gate.

- **[DX4] Major** — **`agent_state` bakes source-specific columns into one shared table.** `wake_at`
  (timer), `wake_on_event` (event), `resume_token` (human) are each welded to a specific built-in
  source. A new wake source (a Redis stream cursor, an SQS receipt handle, a Temporal workflow id) needs
  its *own* column → an `ALTER` on the shared state table per source → a schema fork, the exact opposite
  of the engine seam where each engine owns its own path prefix. FIX: a generic `wake_condition jsonb`
  (`{ source, payload }`) that the adapter owns; keep only genuinely hot-path scalars (e.g. an indexed
  `wake_at`) as columns, and let each source map its fields in/out. Then adding a source touches no
  shared DDL.

- **[DX5] Major** — **The suspend/resume wait tools are a fixed set welded to the built-in sources.**
  `wait_until`/`wait_for`/`request_approval` (§4.3) and the AL1 validator are hardcoded; a new wake
  source that needs a new wait primitive (Temporal `wait_for_signal`, SQS `wait_for_message`, a webhook
  `wait_for_callback`) has no way to contribute one — it would have to edit the runtime tool set, the
  suspend dispatch, and AL1. The wait vocabulary and the wake sources are the same axis but only one end
  is (claimed) pluggable. FIX: let a `WakeSourceAdapter` declare the wait tool(s) it services and the
  `status`/condition it sets; derive the runtime tool set and AL1's resolvable-target list from the
  registered sources.

- **[DX6] Major** — **A fourth, un-registried pattern beside engines and connectors — reconcile with
  SPEC-010.** Event-wake is welded to Postgres `LISTEN/NOTIFY`, yet the engine taxonomy already carries
  `emit`/`react`/`sequence` capabilities and a per-engine fidelity matrix — a wake/event mechanism looks
  a lot like an engine capability, not a new concept. SPEC-014 invents "wake source" as a parallel idea
  with none of the engine/connector rigor. Either it *is* an `EngineAdapter` capability (the `react`
  provider drives wake) or it is a genuinely new registry — the spec must pick and justify, not float a
  third pattern. FIX: state explicitly whether a wake source is a new `WakeSourceAdapter` registry or a
  capability surfaced on the existing `EngineAdapter`; if new, say why it can't ride the engine seam and
  give it equal contract-grade treatment.

- **[DX7] Minor** — **Byte-identity gate for `_events` is ambiguous.** §4.1 says `emit()` *always* gains
  the outbox write (+ `AFTER INSERT` trigger + `pg_notify`); §2/§5 claim byte-identical export "when no
  agent or trigger exists." A model with events but **no agents** would still gain a new `_events` table,
  a DB trigger, and a notify call → not byte-identical. The zero-*agent* case and the zero-*trigger* case
  are conflated. FIX: state the gate — the outbox/trigger are emitted only when ≥1 agent-mode reaction or
  native wake target exists — and add the "events but zero agents ⇒ byte-identical" case to §6, matching
  the SPEC-010/013 regression guarantee precisely.

- **[DX8] Nit** — **Naming breaks the house `*Adapter` + `register*` idiom.** Everywhere else the seam is
  `EngineAdapter`/`ConnectorAdapter` with `register*`; here it is just "wake sources." The absent naming
  is itself the tell that this was not designed as a seam. FIX: adopt `WakeSourceAdapter` /
  `registerWakeSource` so the codebase reads as one consistent seam family and a contributor's muscle
  memory from engines/connectors transfers.

---

## Disposition summary

| # | Severity | Concern |
|---|---|---|
| DX1 | Blocker | No `WakeSourceAdapter` contract/registry — wake is a hardcoded enum, not a seam |
| DX2 | Major | D6 conflates "no user knob" with "no contributor seam" — kills extensibility as a side effect |
| DX3 | Major | No one-file-no-core-edit acceptance probe (cf. fake-mysql / second-connector) |
| DX4 | Major | `agent_state` has per-source columns → new source = ALTER on shared table (schema fork) |
| DX5 | Major | Wait tools (`wait_until`/`wait_for`/`request_approval`) fixed — no new wake primitive extensible |
| DX6 | Major | Un-registried 4th pattern beside engines/connectors — reconcile with the SPEC-010 `react`/`emit` capability |
| DX7 | Minor | `_events` byte-identity gate ambiguous (zero-agent vs zero-trigger conflated) |
| DX8 | Nit | Naming breaks the `*Adapter`/`register*` house idiom |

**Bottom line.** Everything *except* the wake seam is well-judged — but the wake seam is the entire remit
of this lens, and as written it is not extensible: closed set, no contract, no registry, no probe,
source-coupled state, source-coupled wait tools. This is the same under-defined-seam failure that earned
SPEC-013 v0.1 a Reject; the same remedy applies — port SPEC-010's contract-grade rigor (interface +
registry + probe + byte-identity) onto the wake axis. **Reject; re-review on a revision that makes wake a
registered `WakeSourceAdapter` seam (or explicitly folds it into the engine seam) with an acceptance
probe.**

---

## Re-review (v0.3.0, 2026-07-18)

The revision **ports SPEC-010's seam idiom onto the wake axis verbatim** — a named contract, a
`register*/get*/registered*` registry sorted→deterministic, self-registering built-ins in an `index.ts`,
and a one-file byte-identical acceptance probe. Verified against `packages/codegen/src/engines/`
(`registry.ts` + `index.ts`): the §4.4 shape matches the house bar. Every finding is dispositioned below.

| # | Sev | Disposition |
|---|---|---|
| DX1 | Blocker | **Closed** — §4.4 defines `interface WakeSourceAdapter { source; applies?; waitTools(); emitResumer() }` in `packages/codegen/src/wake/registry.ts` with `registerWakeSource`/`getWakeSource`/`registeredWakeSources` (sorted→deterministic) and built-ins self-registering in `wake/index.ts`. A real seam, not an enum (D1 revised from a closed enum). |
| DX2 | Major | **Closed** — auto-pick is now `selectWakeSource(shape)` choosing *from* `registeredWakeSources()`; a third-party source declares the shape(s) it serves and participates. D6 reworded: auto-pick is a UX call, the source **set stays open**. |
| DX3 | Major | **Closed** — §4.4/§6 add the probe: register a 4th source (`redis`) in **one file**; assert **zero core-dispatch edits** and **byte-identical export when not selected** — the fake-mysql/second-connector gate, on the wake axis. |
| DX4 | Major | **Closed** — `agent_state` carries generic `wake_condition jsonb` ({ source, …adapter-owned }); only `wake_at` is promoted as an indexed hot-path scalar. A new source adds **no shared DDL**. |
| DX5 | Major | **Closed** — the wait vocabulary is adapter-declared via `waitTools(): ToolDef[]`; the runtime tool set **and** AL1's resolvable-target list are **derived from registered sources** (§4.3/4.4/4.10). Both ends of the axis are now pluggable. |
| DX6 | Major | **Closed** — §4.4 justifies a **distinct** registry rather than floating a third pattern: a wake source pairs a *runtime resumer* with *wait primitives*, "neither of which the `EngineAdapter` contract expresses." Picks and defends, per the ask. |
| DX7 | Minor | **Closed** — the gate is now precise: outbox/state/trigger DDL emits **only when ≥1 agent-mode reaction or native wake target exists** (§4.1); the "events but zero agents ⇒ byte-identical" case is an explicit §6 test. Zero-agent vs zero-trigger no longer conflated. |
| DX8 | Nit | **Closed** — `WakeSourceAdapter` / `registerWakeSource`; reads as one seam family with engines/connectors. |

**New (Nit, non-blocking).** §4.1/D8 make the DDL owner a **`lifecycleAdapter` "(an `EngineAdapter`)"** —
good reuse of the existing seam — but its registration path and, critically, its **`applies(ctx)`
lane-active gate** (the thing that *mechanically* enforces the DX7 byte-identity guarantee) are only
implied. Pin at build: `lifecycleAdapter` registers via `registerEngine`, and its `applies()` returns
true iff the lane is active, so the byte-identity gate is enforced by the same registry dispatch as every
other engine — not a bespoke `if`. Nit, not a Blocker; the guarantee is stated, only its wiring is
unspecified.

**VERDICT: Reject → Approve-with-changes. The Blocker (DX1) is CLOSED**; all five Majors (DX2–DX6), the
Minor (DX7), and the Nit (DX8) are closed. The wake axis is now a contract-grade, registered, probe-backed
seam at the SPEC-010/013 bar. One residual Nit (lifecycleAdapter registration + `applies()` gate) to settle
at build; it does not hold the approval.
