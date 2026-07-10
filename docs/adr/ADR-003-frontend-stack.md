---
id: ADR-003
title: Front-end stack — React + Vite SPA, hosted, bilingual, IR-driven
type: adr
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-10
updated: 2026-07-10
supersedes: null
related: [SPEC-001, ADR-001, ADR-002, PLAN-001, REV-002, REV-004, REV-005]
---

# ADR-003 — Front-end stack

## Status
Approved. Framework, deployment posture, and language scope were chosen by the product owner
on 2026-07-10; the remaining items are conventional defaults consistent with SPEC-001 §6.1,
ADR-001 (TS end-to-end), and ADR-002 (git truth + derived cache).

## Context
The MVP (SPEC-001) needs a graphical app: a guided Business Narrative editor, an interactive
**Capability Map**, and a **review inbox**. Hard constraints from prior decisions:
- Renders **only from the IR + findings**; the canvas is a projection, never the source of
  truth (SPEC-001 §3.3, REV-002 F1/F2).
- Users are (often non-technical) business people: **structured forms, not raw YAML**
  (REV-004 F1); mandatory **diff-before-apply**; glossary/tooltips (REV-004 F2/F3).
- Model/LLM/narrative strings are untrusted: **text-not-HTML**, sanitized markdown (REV-005 F4).
- Shared `@vbd/ir` TypeScript types must flow into the client unchanged (ADR-001).

## Decision

### Chosen (product-owner decisions)
1. **Framework: React + TypeScript on Vite** (SPA). Decisive factor: **@xyflow/react
   (React Flow)** is the most mature node-graph canvas, and the Capability Map is the core of
   the product. Vite over Next.js because this is a client-heavy editor talking to a **separate
   TS API** (`apps/service`); SSR/RSC would add a server we don't need.
2. **Deployment: hosted web SPA** for the MVP. Business data + narratives are sent to the
   service and the LLM, gated by the `externalLLM` opt-out already specced (SPEC-001 §6.2, R6).
   The app is kept **Tauri-wrappable** (no Node/DOM-server assumptions in the UI) so a
   **local-first desktop** build — the strong-privacy / local-LLM path — remains open without a
   rewrite.
3. **Language: bilingual DE/EN from day one.** i18n via **i18next + react-i18next**; all UI
   strings are keys from the start (no retrofit). Narrative/model *content* is language-agnostic
   (users author in any language); only chrome is translated. Default locale DE, switchable EN.

### Defaults (this ADR)
4. **Compute boundary (strategic):** the pure, deterministic packages — `@vbd/compiler`,
   `@vbd/validation`, `@vbd/narrative` — run **client-side** for instant feedback (parse →
   compile → validate → render as you type). The **service owns** git I/O, the `.vbd`/SQLite
   cache, LLM calls, and all secrets. The IR the browser computes is advisory; the service's
   compiled+cached IR (ADR-002) is authoritative on save.
5. **Canvas + layout:** `@xyflow/react` with **elkjs** layered auto-layout; node positions are
   a pure function of the IR and are **never persisted** (REV-002 F2).
6. **Editing:** structured forms are primary — **React Hook Form + Zod**, with the Zod schema
   kept in lockstep with `packages/schema/capability.schema.json` (a test asserts parity).
   **CodeMirror 6** provides an expert-only raw view (lighter than Monaco).
7. **State:** **TanStack Query** for server data (IR, findings, reviews); **Zustand** for local
   UI/canvas state. No Redux.
8. **UI / accessibility:** **Tailwind CSS + Radix primitives (shadcn/ui)** — supplies the
   accessible diff dialog, tooltips/glossary, and review inbox.
9. **Markdown & security:** render model/LLM strings as **text**; markdown via a sanitizing
   renderer (react-markdown with a hardened schema, or markdown-it + DOMPurify). **No
   `dangerouslySetInnerHTML`** on model content (REV-005 F4). LLM/API secrets never reach the client.
10. **Testing:** **Vitest + React Testing Library** for units; **Playwright** for one E2E of the
    core loop (narrative → generate → review → apply), mapping to acceptance A1/A3/A6.
11. **Package layout:** `apps/web` (SPA) and `apps/service` (TS API) join the npm workspace and
    import `@vbd/*` directly. Vite resolves the workspace TS packages; the service reuses the
    same packages server-side.

## Alternatives considered
- **Svelte + Svelte Flow** — same xyflow graph family, lighter runtime; rejected for the smaller
  ecosystem/component-lib/hiring pool. Re-open only if team preference shifts.
- **Next.js** — rejected: SSR/RSC/route-server complexity with no MVP payoff; our API is separate.
- **Monaco instead of CodeMirror** — rejected: heavyweight (VS Code) for what is an expert-only surface.
- **API-round-trip for all compile/validate** — rejected as the default: loses the instant-feedback
  win of client-side pure functions; the server still re-computes authoritatively on save.

## Consequences
- (+) One shared IR type across client, service, and packages; live feedback with no server hop.
- (+) Accessible, form-first UX that honors REV-004; sanitized rendering honors REV-005.
- (+) Tauri path preserves the privacy/local-LLM option without a rewrite (REV-005/R6).
- (−) **This is where we accept real npm dependencies** (React, Vite, xyflow, …) and lose the
  current zero-dep/offline property of the packages. Mitigation: commit the lockfile; CI installs
  once and caches; keep the *pure packages'* own tests dependency-free (they already are) so the
  compiler/validators stay verifiable in isolation.
- (−) Client-side compute means the compiler/validators ship to the browser — fine (they're
  small, pure, no secrets), but the **service remains the authority** on persisted IR.
- (−) i18n-from-day-one adds per-string key discipline; accepted to avoid a costly retrofit.

## Follow-ups
- ADR-00x (later): LLM provider/skill-runtime + the local-LLM path for a Tauri build.
- Scaffold `apps/web` (Vite+React+i18n+Tailwind+xyflow) and `apps/service` (TS API over
  `@vbd/store`/`@vbd/compiler`); wire the narrative editor to `@vbd/narrative`.
- Parity test: Zod capability schema ↔ `capability.schema.json`.
