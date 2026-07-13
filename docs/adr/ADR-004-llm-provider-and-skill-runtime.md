---
id: ADR-004
title: LLM provider & skill runtime — provider-agnostic, server-side secrets, mock for offline
type: adr
status: Approved
version: 1.1.0
author: Claude (Opus 4.8)
created: 2026-07-10
updated: 2026-07-10
supersedes: null
related: [SPEC-001, ADR-003, PLAN-001, REV-003, REV-005]
---

# ADR-004 — LLM provider & skill runtime

## Status
Approved. Realizes SPEC-001 §4 (named, schema-constrained skills) for M2, consistent with
ADR-003 (client-side pure compute) and REV-005 (secrets, injection).

## Context
M2 introduces the first LLM skill, `CapabilityGenerator` (narrative → capabilities). We need a
runtime that: is provider-agnostic (SPEC-001 §4), keeps API keys off the client (REV-005 F1/F8),
is testable without a live model (REV-003 F2), and enforces structured output + repair-retry
(SPEC-001 §4.4). We also have no design partner yet (G-DP gates *closing* M2) and no wired key.

## Decision
1. **Provider-agnostic `LlmProvider` interface** (`complete(request) → result`). Skills depend on
   the interface, never a vendor SDK.
2. **`MockProvider`** — a deterministic, dependency-free surrogate that derives capabilities from
   the narrative's Core Activities via a keyword→capability rule table. It runs **client-side and
   in tests** (no key, no network), so the whole pipeline — generation → provenance → validation →
   IR → map — is exercisable offline today. It is explicitly a *stand-in for the LLM's mechanical
   derivation*, not a substitute for its judgment.
3. **Real provider — the official `@anthropic-ai/sdk`, server-side, in `apps/service`.** The
   project is TypeScript, so per the claude-api guidance the real call uses the **official SDK**
   (not raw HTTP), and it runs **server-side only** (`apps/service`); the key comes from server env
   (`KILN_ANTHROPIC_API_KEY`, loaded via `node --env-file`) and **never reaches the browser**
   (REV-005). The client POSTs the narrative to `POST /api/generate`; it does not call the model
   directly. `@kiln/skills` stays **SDK-free/isomorphic** (mock + prompt + parsing only); the SDK
   dependency lives solely in the service. *(v1.0.0 proposed a dependency-free `fetch` client in
   `@kiln/skills`; superseded to avoid mixing SDK + raw HTTP in one project.)*
4. **Model & effort are user-selectable in-app.** Default is **`claude-sonnet-5` at
   `output_config.effort: "medium"`** ("sonnet medium"). Effort is GA (no beta header) on Sonnet 5
   / Opus 4.x but **errors on Haiku 4.5**, so effort is coupled to the model in the catalog
   (`GET /api/models`) and omitted for models that don't support it.
5. **Structured output + repair:** generation requests use **structured outputs**
   (`output_config.format` = a JSON Schema of the capabilities shape) so the model can't drift to
   `name`/`description`; output is coerced + validated; on invalid/blocking output the skill runs
   **one repair retry**, then surfaces a soft error (SPEC-001 §4.4, REV-003 F7).
5. **Prompt-injection posture:** the narrative is wrapped as explicit DATA, not instructions;
   every generated capability must cite `meta.derivedFrom` anchors (evidence), and deterministic
   validators (`@kiln/validation`) are the backstop for all objective claims (REV-005 F3).
6. **Provenance & reproducibility:** generated capabilities record `meta.origin`, `skillVersion`,
   and (for the real provider) `modelId`; generation is attributable (REV-005 F6).

## Alternatives considered
- **Anthropic SDK dependency** — deferred; a `fetch` client keeps `@kiln/skills` dependency-free
  and browser/Node-isomorphic. Revisit if we need streaming/tool-use ergonomics.
- **Client-side real LLM calls** — rejected: would expose the API key in the browser (REV-005).
- **No mock (require a key to run generation)** — rejected: blocks all M2 dev/test on G-DP + a key.

## Consequences
- (+) The narrative→capabilities pipeline is buildable, testable, and demoable **now**, offline.
- (+) Swapping in the real model is a provider change behind a stable interface; server owns secrets.
- (+) Injection + provenance controls are structural, not bolted on.
- (−) MockProvider quality ≠ LLM quality; **A1 (capability correctness) still requires the real
  provider + design partner (G-DP)** to close M2. The mock proves the *plumbing*, not the *judgment*.
- (−) The real provider path needs `apps/service` (later milestone) before it can run.

## Follow-ups
- `@kiln/skills`: `LlmProvider`, `MockProvider`, `AnthropicProvider` (stub), `CapabilityGenerator`.
- `apps/service`: server route that runs `AnthropicProvider` with the env key.
- Wire the eval harness (`@kiln/eval`) to score generator output (REV-006 F2).
