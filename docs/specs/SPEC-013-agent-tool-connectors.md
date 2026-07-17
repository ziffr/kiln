---
id: SPEC-013
title: Agent Tool Connectors — typed external-system tools an agent can be granted
type: spec
status: Approved
version: 1.1.0
author: Claude (Opus 4.8)
created: 2026-07-17
updated: 2026-07-17
supersedes: null
related: [SPEC-006, SPEC-008, SPEC-009, SPEC-010, SPEC-012, ADR-002]
reviewers: [technical-architecture, security-data, product-strategy, extensibility-dx, ux-hitl]
---

# SPEC-013 — Agent Tool Connectors

> **v0.3.0 — owner steer: Nango for OAuth, never n8n.** v0.2.0 followed the product/architecture lenses
> toward "n8n-native default, defer Nango." The owner overrode that: **a hard dependency on n8n is
> forbidden (invariant #8), and Nango is the deliberate no-n8n path to OAuth SaaS.** So the shipped
> default execution is **standalone, Nango-brokered**; n8n is an *optional* alternative adapter, never
> required. Consequence: the Nango security hardening the security/UX lenses flagged is **in-scope now**
> (not deferred). The grant abstraction, the registered `ConnectorAdapter` seam, and the one-connector
> scope discipline from the review all stand. Full disposition + the logged owner override in §9.

## 0. Scope & demand-signal gate

Per the methodology (SPEC-005's shelving discipline), scope is tight and staged:
- **Phase A + B ship now:** grant model, validators, the registry seam, and **one** connector
  (**Spreadsheet**) end-to-end over the **Nango-brokered standalone** path, with its security hardening.
- **Phase C (full catalog + grant UI) HOLDS** until a design partner needs it.
- **An optional n8n adapter** (for owners who already run n8n and prefer it) is a later, additive
  alternative — never on the critical path.

## 1. Problem

An agent can be modelled but cannot **operate**: it cannot read an inbox, read/write a spreadsheet, or
touch a CRM with real reach. Today `AgentToolKind = command|read|notify|email|slack|pdf|external`;
`email/slack/pdf` are outbound comms and `external` is one coarse "call a URL" delegate. There is no
typed, grantable connector, and the runtime auth (`agents/src/auth.ts`) is a static env token — it
cannot do OAuth SaaS. This spec adds the **connector-definition + per-agent-grant** layer and brokers
OAuth through **[Nango](https://nango.dev)** so an agent can operate **without any n8n dependency**.

## 2. Goals / Non-goals

**Goals**
- An authored **`ToolDef`** — *grant-surface metadata only* (name, provider label, typed operations),
  carrying **no destinations or secrets** (§4.1).
- Per-agent **grants nested on the agent** (`AgentInput.grants`), human-gated (invariant #6) (§4.2).
- A registered **`ConnectorAdapter`** seam mirroring SPEC-010; the adapter owns all provider glue (§4.3).
- **`execution: "nango"`** as the shipped default — the standalone runtime calls the provider API with a
  Nango-brokered token; **no n8n required** (invariants #6/#7/#8) (§4.4).
- **Nango security hardening in-scope** (§4.7): server-mediated secret (never in the browser), an async
  auth resolver, per-op tool-surface honesty, a write/send/delete invocation gate, and a secret-free
  audit log.
- One connector end-to-end (**Spreadsheet**, §5); byte-identical export when no grant exists.

**Non-goals (this spec)**
- Any *required* dependency on n8n. An n8n adapter is optional and additive (Phase C+).
- `execution: "direct"` against a raw static token for OAuth SaaS (Nango is the broker).
- A multi-connector catalog → Phase C, on demand.
- A generic `http_request`/`fetch(url)` tool (permanent non-goal, invariant #6).
- Kiln holding tokens or running the OAuth dance itself — Nango holds tokens; Kiln references a
  connection by name (invariant #7, strengthened).

## 3. Current shape (reference)
`agents.ts` (`AgentToolKind`, `agentContract`, `buildToolSchemas`, `agentToolParams` — fixed `kind`
switch, `input?: string[]`); `agents/src/auth.ts` (**sync** `ExternalAuth`, static env token — the thing
Nango must not be crammed into); `services.ts` (external delegate → `httpRequest`); `comms.ts` (outbound
email/slack/pdf); `integrations.ts` (Excel import/export transport).

## 4. Design

### 4.1 `ToolDef` — grant-surface metadata only  *(SEC3, DX3, TA7)*
```ts
interface ToolDef {
  id: string; name: string;
  providerLabel: string;              // human label only, e.g. "Google Sheets" — NOT an endpoint
  operations: Array<{
    name: string; kind: "read"|"list"|"write"|"send"|"delete";
    input: IOSpec[]; output: IOSpec[];   // §4.6
    scopes?: string[];                    // the OAuth scopes this op needs (see SEC2 honesty note, §4.7)
  }>;
  meta: { origin: "authored"; /* derivedFrom for a model suggestion */ };
}
```
A `ToolDef` carries **no URL, host, node id, method, connection, or secret** — all provider glue and
destinations live in the `ConnectorAdapter` (§4.3, code, ADR-002). This is what keeps a connector from
degenerating into the forbidden `fetch(url)`: the destination is never model-authored. **TC6** rejects
any raw URL/host/template on a `ToolDef`.

### 4.2 Grants — nested on the agent; suggest→grant→connect, never auto  *(TA5, UX1, UX3)*
```ts
// on AgentInput:
grants?: Array<{ toolId: string; operations: string[]; autonomous?: boolean }>;
```
Three visibly-separate acts, so the human knowingly authorizes (invariant #6):
1. **Model may SUGGEST** a grant (grounded in the agent's goal/caps; a `derivedFrom` on the proposal).
2. **Human GRANTS** it — one at a time, **no bulk/auto-accept** (the enrich *visual* idiom is reused, its
   one-click `⚡ Auto` path is deliberately **not**). Granting is a reversible **model edit with no
   real-world effect**.
3. **Human CONNECTS a live account** — a *separate*, deliberately-confirmed step (§4.9) that names the
   provider + real account + the scopes being authorized, and mints the Nango connection.

### 4.3 The `ConnectorAdapter` seam (mirrors SPEC-010)  *(DX1, DX2, TA2)*
```ts
interface ConnectorCtx {           // (nailed down per the re-review nit)
  domain: DomainDoc; agents: AgentsDoc; binding: Binding;
  toolId: string; connectionRef: string;   // opaque Nango connection reference (never a token)
}
interface ConnectorAdapter {
  toolDef: ToolDef;                                   // the grant surface it backs
  emitNango(op: string, ctx: ConnectorCtx): { runtime: string /* emitted TS calling provider via Nango token */ };
  emitN8n?(op: string, ctx: ConnectorCtx): { node: string; operation: string; params: Record<string,unknown> }; // optional adapter
  applies?(ctx: ConnectorCtx): boolean;
}
registerConnector(a); getConnectorAdapter(id); registeredConnectors(); // sorted → deterministic
```
`packages/codegen/src/connectors/` is a registry + `connectors/index.ts` side-effect registration,
exactly like `engines/`. **All provider glue lives in the adapter, never in `model.json`.** A new
connector is one registered file. **Acceptance probe (committed, §6):** register a *second* connector as
one file, assert zero edits to dispatch and byte-identical export when ungranted. Adding a connector
needs no dispatch edits; introducing the mechanism (Phase A/B) touches core once — steady-state authoring
does not.

### 4.4 Two swappable axes: auth source × execution  *(owner steer; refines D2)*
A connector has **two orthogonal, swappable bindings** — and **no path ever requires installing n8n for
OAuth.**

**Auth source** — where the OAuth token comes from:
- **`nango` (default)** — Kiln's service brokers a fresh token via Nango. No n8n.
- **`n8n-credentials` (optional)** — for a company that **already runs n8n**: Kiln's service reads the
  OAuth token from n8n's **credential store** via n8n's API, reusing an OAuth pool they already set up.
  You do **not** stand up n8n for this — it's opt-in only when n8n is already present. Same
  server-mediation discipline as Nango: the n8n API key is server-only, never in the browser or
  `model.json`, the token is ephemeral (§4.7 SEC1/SEC5/SEC8 apply identically).
- **`env`** — a static API key (the existing `credentialEnv` path) for non-OAuth services.

**Execution** — who makes the provider call:
- **`standalone` (default)** — the generated agent runtime calls the provider API directly with the
  resolved token. No n8n.
- **`n8n-node` (optional)** — the op runs as an n8n native node, for owners who prefer n8n to execute too.

**Default = `nango` + `standalone` → zero n8n.** Every n8n touchpoint is opt-in for those who already
have it: *tap the credential pool* (`n8n-credentials`, lightweight — n8n only serves the token, Kiln
executes), and/or *route execution* (`n8n-node`). The `ConnectorAdapter` seam is source- and
execution-agnostic (SPEC-010/#8), so these are bindings, not forks — a connector authored once works
under any combination.

### 4.5 Op → agent tool projection  *(TA4, DX7)*
Add a `connector` member to `AgentToolKind`. A granted op becomes a tool named **`<toolId>_<op>`**
(deterministic namespacing — no collisions). `agentToolParams`/`buildToolSchemas` gain an
`IOSpec[]`→JSON-Schema branch so typed inputs survive; `output` is consumed for response coercion. `kind`
drives the schema builder **and** the invocation gate (§4.7). Connector `kind` is
`read|list|write|send|delete`, mapped onto the `connector` `AgentToolKind` — not a parallel taxonomy.

### 4.6 I/O vocabulary  *(DX6, D3)*
Connector I/O uses **`IOSpec`** = `AttributeSpec` (`{name,type}`) **plus** `array` / `object` / `json`
(raw provider passthrough) — so a thread→messages list or a 2-D range is expressible. Honours D3 (one
typed vocabulary) while closing the gap the review found.

### 4.7 Nango security hardening — in-scope  *(SEC1, SEC2, SEC4, SEC5, SEC6, SEC7, TA1, UX1, UX5)*
- **SEC1 — secret never in the browser.** `NANGO_SECRET_KEY` lives only in `apps/service`. New
  `/api/connectors/*` routes mediate every secret-key call; the browser receives only a short-lived
  Nango Connect **session token** to run the OAuth popup — never the secret. A test mirrors the existing
  secret-never-client-side invariant check for the Nango path (invariant #3).
- **TA1 — async resolver, not the sync enum.** A **new** `resolveConnectorAuth(connectionRef):
  Promise<Headers>` seam fetches the token at call time; the sync `externalAuthHeaders` (static-token
  path) is untouched. `ToolDef.auth` is not shoehorned into `ExternalAuth`.
- **SEC4 — invocation gate.** Any `kind ∈ {write,send,delete}` op requires **per-invocation human
  confirmation** unless the grant sets `autonomous:true`. Reading untrusted data + an autonomous write is
  the core threat; the gate is at invocation, threaded through the run loop.
- **SEC5 — secret-free audit log.** The runtime records `{agentId, toolId, op, connectionRef, ts,
  outcome}` — never the token or body. A test asserts no token appears in logs/errors.
- **SEC2 / UX5 — honest scope.** Per-op grants restrict the *tool surface*, not the token (a Nango token
  carries the integration's configured scopes). The UI surfaces the bound connection's **actual** OAuth
  scopes (from Nango) and warns when they exceed what the granted ops need; docs state the limitation
  plainly; recommend one `providerConfigKey` per scope-tier (read vs write).
- **SEC6 — non-PII connection ref.** `connectionRef` in `model.json` must be opaque (not an email/tenant
  id); a validator rejects a PII-shaped ref; docs note `model.json` reveals connection *topology*.
- **SEC7 — posture.** The runtime uses a raw `fetch` to Nango's REST API (no SDK — keeps the exported app
  dependency-light); **self-host (`NANGO_HOST`) is the recommended posture**; §7 notes the
  broker-compromise blast radius.
- **SEC8 — the broker endpoint is gated.** `/api/connectors/*` inherits the studio auth gate
  (`KILN_STUDIO_TOKEN`); a minted Nango Connect session token is scoped to the requesting project. The
  resolved provider token is **ephemeral** — held in memory for the single call, never written to disk or
  `model.json`, and never logged (SEC5).

### 4.8 Validators (additive, pure: TC-series)
**TC1** grant `toolId` resolves. **TC2** granted op exists. **TC3** provider label non-empty; every op
has a `kind`. **TC4** an agent-prompt naming an ungranted op → *fabrication* finding. **TC5** no secret
literal / embedded token anywhere in a connector or grant. **TC6** no raw URL/host/endpoint on a
`ToolDef` (destinations live in the adapter). **TC7** `connectionRef` is opaque/non-PII (SEC6).

### 4.9 UX (Agents stage)  *(UX1, UX2, UX3, UX5, UX6, UX7, UX8)*
Tools section: suggested grants (dismissible, **no bulk-accept**); a per-op control **grouped by
`kind`** (read-only visually separate from write/send/delete), each with an on-demand "what this lets
the agent do" explanation. **Two-step consent (UX1):** granting (a model edit) is distinct from a
deliberate **"Connect a live account"** step that names provider + account + the scopes being
authorized, and shows the connection's **real** granted scopes (UX5). **Honest readiness (UX2):** a
shape+text status per grant — `granted (no live connection) / connected / error` — from a real Nango
connection check, never color-only; rolled up so nothing looks wired when it isn't. A **revoke**
affordance per grant states plainly what it does to the Nango connection; a per-project **"granted
authority" audit view** (agent×connector×op×connection). **Test runs stay mock by default;** a
separately-consented, distinctly-badged "run against the live connection" mode is opt-in. aria on the
multi-select + status; i18n EN+DE.

### 4.10 Overlap rule vs comms & external-services  *(DX4)*
**connector** = typed multi-op catalog entry with brokered (Nango) auth; **external-service** =
single-endpoint bespoke delegation with a static credential; **comms** = fire-and-forget templated
notify. When an agent is granted an Email connector's `send`, it **supersedes** that agent's comms
`email` tool. The MVP (Spreadsheet) has no comms overlap.

## 5. Rollout
- **Phase A — model + seam (pure).** `ToolDef` + `IOSpec` + `AgentInput.grants`; TC1–TC7;
  `ConnectorAdapter` registry + probe; eval (incl. `spuriousSuggestionRate`, PS5). Byte-identical.
- **Phase B — Spreadsheet over Nango (the proof).** define → suggest → grant → connect (server-mediated
  Nango) → `read_range`/`append_row` in a generated standalone agent, with the write-op gate + audit log.
  **No n8n anywhere in this path.** (D1 — Spreadsheet over Email: lower prompt-injection blast radius,
  already in the solar fixture.)
- **Phase C — catalog + grant UI + the optional n8n adapter. HELD** until a partner signal.

## 6. Testing (to commit)
TC1–TC7 seeded-defect recall; `ToolDef`/`grants` round-trip through `model.json`; op→tool-schema
projection preserves typed I/O + namespacing; TC4 flags an ungranted op; **`spuriousSuggestionRate`**;
the **§4.3 acceptance probe**; the **write-op invocation gate** fires; the **Nango auth resolver** builds
a request with a fetched token and **no token leaks** into the bundle/logs/errors; the
**secret-never-client-side** check for the `/api/connectors/*` path; byte-identity at zero grants.

## 7. Risks & mitigations
- **Muscle/iPaaS drift** → one connector + registry; catalog held; Kiln emits declarations, Nango holds
  tokens, the provider call is bounded per-adapter and swappable.
- **Nango = trust concentration** (all tenants' tokens) → self-host recommended; raw-fetch not SDK;
  server-only secret; broker-compromise blast radius acknowledged.
- **Prompt-injection into a write** → §4.7 invocation gate; Spreadsheet MVP, not inbox-reading.
- **Authority creep (model over-suggests)** → suggestions inert until human grant; `spuriousSuggestionRate`;
  TC4 fabrication.

## 8. Decisions (resolved)
- **D1 → Spreadsheet** as the Phase-B proof (PS4).
- **D2 → Nango-brokered standalone default; n8n optional/additive, never required** — **owner override**
  of the product (PS2) and architecture (TA3) "n8n-first" recommendation, on the ground that a hard n8n
  dependency violates invariant #8 and Nango is the deliberate no-n8n OAuth path (§9).
  *(v1.1.0: the n8n option is split into two orthogonal opt-in axes — an `n8n-credentials` **auth source**
  and an `n8n-node` **execution** target — so a company already running n8n can tap its OAuth credential
  pool as a lightweight token source without n8n ever being on the default path or being installed for
  OAuth; §4.4.)*
- **D3 → reuse `AttributeSpec`, extended to `IOSpec`** (array/object/json) (DX6).

## 9. Review & closure

Five lenses (REV-032…036): technical-architecture, security-data, product-strategy, ux-hitl →
**Approve-with-changes**; extensibility-dx → **Reject**, re-reviewed to **Approve-with-changes** on
v0.2.0 (DX1–DX7 resolved; `ConnectorCtx` nit fixed in §4.3).

**Owner override (logged per CONV-001 §4 closure rule):** the product-strategy thrust and D2's
"n8n-first / defer Nango" (PS2; architecture TA3's default) are **overridden by the owner**: no hard n8n
dependency (invariant #8); Nango is the chosen OAuth path. The lenses' *technical* Nango-hardening
findings are **accepted and pulled in-scope** (§4.7) rather than deferred.

| Finding | Disposition |
|---|---|
| PS1 demand signal | **Fixed** — §0 gate; Phase C held. |
| PS2 Nango premature (n8n-first) | **Owner-overridden** — Nango is the no-n8n OAuth path (§8/D2). |
| PS3 catalog = iPaaS liability | **Fixed** — one connector + registry; catalog held. |
| PS4 Email injection risk | **Fixed** — Spreadsheet MVP; write-gate. |
| PS5 no over-suggestion metric | **Fixed** — `spuriousSuggestionRate`. |
| PS6 / D3 | **Accepted** — `IOSpec` (§4.6). |
| TA1 nango vs sync auth | **Fixed** — async `resolveConnectorAuth` seam, sync path untouched (§4.7). |
| TA2 registry hand-wavy | **Fixed** — `ConnectorAdapter` + `ConnectorCtx` (§4.3). |
| TA3 direct muscle / n8n-first | **Owner-overridden on default** (§8); the muscle concern is bounded to one adapter + registry (§7). |
| TA4 op→schema | **Fixed** — §4.5. |
| TA5 grants de-normalized | **Fixed** — nested on `AgentInput` (§4.2). |
| TA6 byte-identity/templates | **Fixed** — emitted only on a grant; probe (§6). |
| TA7 meta origin | **Fixed** — `origin:"authored"` (§4.1). |
| SEC1 secret to browser | **Fixed (in-scope)** — server-mediated `/api/connectors/*` + test (§4.7). |
| SEC2 per-op ≠ credential scope | **Fixed** — surfaced + documented + scope-tier guidance (§4.7). |
| SEC3 model-authored destinations | **Fixed** — no destination on `ToolDef`; TC6 (§4.1). |
| SEC4 runtime write gate | **Fixed** — invocation gate (§4.7). |
| SEC5 audit trail | **Fixed** — secret-free audit log (§4.7). |
| SEC6 connectionId PII | **Fixed** — opaque `connectionRef`; TC7 (§4.7/4.8). |
| SEC7 trust concentration / dep | **Fixed** — raw fetch, self-host, blast radius (§4.7/§7). |
| DX1 ConnectorAdapter undefined | **Fixed** — §4.3 (+ `ConnectorCtx`). |
| DX2 registry vs core-edits + probe | **Fixed** — §4.3 + §6 probe. |
| DX3 ToolDef non-executable | **Fixed** — glue in adapter; grant-surface only (§4.1/4.3). |
| DX4 overlap | **Fixed** — §4.10. |
| DX5 curated vs open | **Fixed** — open registry (§4.3). |
| DX6 AttributeSpec weak | **Fixed** — `IOSpec` (§4.6). |
| DX7 kind set / taxonomy | **Fixed** — `delete` added; mapped to `connector` kind (§4.5). |
| UX1 collapsed consent | **Fixed** — three-act suggest/grant/connect (§4.2/4.9). |
| UX2 readiness state | **Fixed** — shape+text status (§4.9). |
| UX3 auto-accept | **Fixed** — no bulk/auto-accept (§4.2/4.9). |
| UX4 revoke/audit view | **Fixed** — revoke + authority view (§4.9). |
| UX5 real scope invisible | **Fixed (in-scope)** — surfaced from Nango (§4.7/4.9). |
| UX6 flat op list | **Fixed** — grouped by kind (§4.9). |
| UX7 test-time HITL | **Fixed** — mock default + opt-in live (§4.9). |
| UX8 a11y | **Fixed** — §4.9. |
| SEC8 broker-endpoint authz (from security re-review) | **Fixed** — `/api/connectors/*` inherits `KILN_STUDIO_TOKEN`; ephemeral token (§4.7). |

**Closure status: APPROVED.** All five lenses at Approve-with-changes; every Blocker/Major Fixed,
Accepted, or Owner-overridden with logged rationale; both re-reviews clean. The one residual Minor
(SEC8) is Fixed in §4.7.

### Re-review
- extensibility-dx (v0.2.0): **Reject → Approve-with-changes** — DX1–DX7 resolved; `ConnectorCtx` nit
  fixed in v0.3.0 §4.3.
- security-data (v0.3.0, §4.7 in-scope Nango hardening): **Approve-with-changes** — SEC1 (Blocker)
  closed; all round-1 SEC/TA1 findings resolved and testable; one new Minor SEC8 → Fixed. **No Blocker
  remains.**

### Post-approval refinement (v1.1.0)
Owner clarification: separate the n8n option into two orthogonal opt-in axes — **auth source**
(`nango` default · `n8n-credentials` · `env`) and **execution** (`standalone` default · `n8n-node`) —
so a company already running n8n can tap its existing OAuth **credential pool** as a lightweight token
source (n8n serves the token, Kiln executes) without n8n on the default path or installed for OAuth
(§4.4). Additive and swappable; the default stays `nango` + `standalone` (zero n8n). The
`n8n-credentials` source follows the same server-mediation discipline as Nango (§4.7); a light
security check of that specific path is recommended at build time (Phase B/C).
