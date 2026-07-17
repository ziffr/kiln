---
id: PLAN-013
title: Connector / Nango Ergonomics (SPEC-013 Phase B3) — choose-your-Nango, optional local helper, self-sufficient export
type: plan
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-17
updated: 2026-07-17
supersedes: null
related: [SPEC-013]
reviewers: [owner-directed]
---

# PLAN-013 — Connector / Nango Ergonomics (SPEC-013 Phase B3)

> Execution plan for the ergonomics slice of SPEC-013 (Approved). Numbered to pair with SPEC-013 at the
> owner's request (not the next sequential PLAN id). Design decisions here were made **with the owner**
> in-session; no separate review cycle — it derives from the already-reviewed SPEC-013 and is
> low-risk (tooling + docs + one endpoint fix + a small reuse of the B2 connect flow).

## 1. Purpose

B1 wired the Nango runtime + server-mediated API; B2 added the Studio grant/connect UI. What's missing
is the **operational on-ramp**: how a developer stands up Nango, and how a *generated* app reaches it.
This plan turns "the code is wired" into "choose your Nango and it works" — for both the Studio and the
exported app — **without ever making self-hosting mandatory**.

## 2. The governing principle (symmetric, non-mandatory)

> **The Nango instance is always a runtime binding the operator chooses** — `NANGO_HOST` +
> `NANGO_SECRET_KEY`. Studio and every exported app each point at **Nango Cloud**, an **existing company
> Nango**, or a **local `kiln.sh nango:up`** instance, purely by setting those two vars. None is
> privileged; none is mandatory; the `kiln.sh` helper is convenience, not the required posture.

Corollaries:
- **The model carries only the logical `connectionRef`, never a Nango instance.** The same exported
  artifact is portable across Nango instances — point it at A or B; whichever holds a connection for the
  ref resolves. (Consistent with invariant #7: config by reference, never baked.)
- **`NANGO_SECRET_KEY` stays server-side everywhere** (invariant #3) — already enforced by B1's
  server-mediation + the secret-never-client-side test.

## 3. Deliverables

### 3.1 `kiln.sh nango:up` / `nango:down` — optional local Nango
- A `tools/nango/docker-compose.yml` adapted from Nango's official four-service stack (see §5 reference):
  `nango-db` (postgres:16), `nango-server` (`nangohq/nango-server:hosted`, :3003 API / :3009 Connect UI),
  `nango-redis`, optional elasticsearch (`NANGO_LOGS_ENABLED`).
- `kiln.sh nango:up`: generate `NANGO_ENCRYPTION_KEY` if absent (`openssl rand -base64 32`), boot, then
  **print next steps** — open the dashboard, create the Google Sheets integration, copy the secret key to
  the root `.env` as `NANGO_SECRET_KEY` + `NANGO_HOST=http://localhost:3003`.
- `nango:down` tears it down. Documented as **one option among equals** — never the default posture.

### 3.2 Exported app chooses its Nango at runtime + is self-sufficient
- The generated `docker-compose.yml` / Makefile **thread `NANGO_HOST` + `NANGO_SECRET_KEY` from env**
  into the agents service; the export **references an external Nango**, it does NOT bundle its own empty
  one (connections live in the Nango you point at). An optional documented "co-located Nango" compose
  profile for the all-in-one box.
- **A minimal "Connect account" panel in the generated admin UI** — reusing B2's server-mediated session
  flow — so a deployer can point the export at *any* Nango and connect the account **there**, without
  returning to Studio. This is what makes "the external app chooses its Nango" a complete standalone
  experience.

### 3.3 End-to-end setup guide
Extend `docs-site/docs/reference/connectors.md` (+ `version-0.8.0` mirror): "choose your Nango (Cloud /
existing / `kiln.sh nango:up`) → configure the Google integration → set `NANGO_*` → grant + connect →
run," for both Studio and export. Present the three Nango options as peers; label the local helper
optional. Include the security notes (scoped key, self-host posture, secret server-side).

### 3.4 B1 endpoint correctness
Verify/fix B1's runtime + service against the current Nango API (§5): the token fetch must use the
**plural, non-deprecated** `GET /connections/{id}?provider_config_key=…&force_refresh` (not the
deprecated singular `/connection/{id}`); the session route uses `POST /connect/sessions`.

## 4. Defaults / out-of-scope
- **Default: one Nango instance per deployment.** Per-connector multi-instance selection (connector X →
  Nango A, Y → Nango B) is a **documented extension**, not built now.
- Out: additional connectors (Phase C), the `n8n-credentials`/`n8n-node` axes, per-tenant connection
  isolation beyond the connectionRef.

### 4.1 Future UX enhancement (deferred) — slide-in connect
Today the connect step opens Nango's hosted Connect UI in a **popup window** (`window.open(connect_link)`),
in both Studio and the exported app. A nicer future variant is an **in-app slide-in drawer** (like Kiln's
docs/help drawer) hosting the connect wrapper, so it feels fully in-app. **Constraint:** the provider's
OAuth consent screen (e.g. Google) **cannot be iframed** (clickjacking protection), so a slide-in can host
the wrapper/status but the actual consent still surfaces as a brief popup. That embedded-drawer experience
is essentially what `@nangohq/frontend`'s `openConnectUI` modal provides — so a slide-in would be the moment
to reconsider adopting the SDK vs. building a Kiln drawer around `connect_link`. Pure polish on top of the
shipped flow; the flow-continuity requirement (poll → flip to *connected*, no manual detour) is already met.

## 5. Verified Nango reference (July 2026)
- **Self-host** — `docker compose up`; `nango-server` = `nangohq/nango-server:hosted`, API **:3003**,
  Connect UI **:3009**; required `NANGO_ENCRYPTION_KEY` (base64 32-byte), DB vars, `NANGO_SERVER_URL`
  (default `http://localhost:3003`), dashboard basic-auth (`NANGO_DASHBOARD_USERNAME/PASSWORD`). Sources:
  [self-hosting](https://nango.dev/docs/guides/platform/self-hosting),
  [compose](https://github.com/NangoHQ/nango/blob/master/docker-compose.yaml).
- **Secret key** — per-environment `NANGO_SECRET_KEY`, Bearer for all API calls, from the dashboard;
  **scoped keys** supported (least privilege). Source:
  [security](https://nango.dev/docs/guides/platform/security).
- **Connect session** — `POST {host}/connect/sessions` (Bearer secret) → `{token, expires_at,
  connect_link}`, 30-min TTL. Source: [ref](https://nango.dev/docs/reference/api/connect/sessions/create).
- **Token fetch** — `GET {host}/connections/{connectionId}?provider_config_key=<integration>&force_refresh`
  (Bearer secret) → `.credentials.access_token`, **auto-refreshed**; the singular `/connection/{id}` is
  **deprecated**. Source: [ref](https://nango.dev/docs/reference/api/connection/get).

## 6. Testing
- `kiln.sh nango:up` compose validates (`docker compose config`); the emitted next-steps are correct.
- Generated compose/Makefile pass `NANGO_*` through; export byte-identity holds when no connector granted.
- The export connect panel: unit-test its pure helpers; in-browser verify the flow against a **stubbed
  Nango** (the live OAuth popup needs real creds).
- The endpoint fix: a test asserts the runtime calls the plural `/connections/` path with `force_refresh`.

## 7. Risks
- **Making self-hosting feel mandatory** → mitigated by framing (three peer options; helper labeled
  optional) — this is the explicit owner concern this plan answers.
- **connectionRef portability confusion** (a ref that exists in Nango A but not B) → the setup guide states
  plainly that a connection must exist in whatever Nango you point at; the export connect panel lets you
  create it there.
- **Nango API drift** → §5 is dated + sourced; the endpoint fix pins the current shape.
