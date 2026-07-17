---
id: REV-033
title: Security-data review of SPEC-013
type: review
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-17
updated: 2026-07-17
reviews: SPEC-013
lens: security-data
verdict: Approve-with-changes
related: [SPEC-013]
---

# REV-033 — SPEC-013, security-data lens

**VERDICT: Approve-with-changes.** Holds the no-generic-fetch line in intent and places the grant gate correctly. Must close the browser-secret gap and make enforcement match the claims.

- **[SEC1] Blocker** — §4.8 connection UI not specified as server-mediated → `NANGO_SECRET_KEY` could reach the browser (violates #3). FIX: ALL Nango secret-key calls go through `apps/service` (`/api/connectors/*`); browser gets only a short-lived Nango Connect **session token**; add a secret-never-client-side test for the Nango path.
- **[SEC2] Major** — per-op grants + `scopes` are a tool-surface restriction, not a credential one: a Nango token carries the integration's full scopes. FIX: state honestly; recommend one `providerConfigKey` per scope-tier (read vs write integration); warn when a `write/send` op is granted on a broad-scope connection.
- **[SEC3] Major** — `direct` op→provider-HTTP mapping unspecified; if endpoints are model-authored, a connector becomes the forbidden generic `fetch(url)` (#6). TC5 catches only literal secrets, not destinations. FIX: op→endpoint owned by the hand-written `ConnectorAdapter` (ADR-002), never in `model.json`; validator that a `ToolDef` carries no raw URL/host.
- **[SEC4] Major** — no runtime human gate on `write/send`; an agent reading attacker-controlled data (inbox/CRM note) can be prompt-injected into firing them. FIX: `kind: write|send` ops require per-invocation confirmation (or explicit authored `autonomous:true` per grant); document the threat.
- **[SEC5] Major** — "audited" defines no audit trail. FIX: structured **secret-free** invocation log `{agentId, toolId, op, connectionRef, ts, outcome}` in the runtime; test the token never appears in logs/errors.
- **[SEC6] Minor** — `connectionId` in `model.json` (git) is often PII (email/tenant) + connection-topology disclosure, not caught by TC5. FIX: constrain to opaque non-PII refs; validator; document the leak.
- **[SEC7] Minor** — Nango = trust concentration (all tenants' tokens); `direct` adds a dep to the dependency-light runtime. FIX: raw `fetch` over the Nango SDK; self-host (`NANGO_HOST`) recommended; note broker-compromise blast radius in §7.
