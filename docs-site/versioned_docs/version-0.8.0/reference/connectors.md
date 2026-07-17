---
sidebar_position: 5
title: Agent tool connectors
---

# Agent tool connectors

An agent Kiln generates can be **granted a connector** — a typed tool that lets it operate a real
external system. The first connector is the **Spreadsheet** connector (Google Sheets): a granted
agent can read a range, list rows, append a row, or update a cell in a live spreadsheet.

Authority is always the human's call. A model may *suggest* a connector, but only a person *grants*
it, and connecting a **live account** is a separate, deliberate step. Kiln never holds your OAuth
tokens — it brokers them through [Nango](https://nango.dev), an open-source OAuth service you can
self-host.

## How the pieces fit

- **The connector** declares *what* an agent may do — typed operations (`read_range`, `list_rows`,
  `append_row`, `update_cell`), each with an OAuth scope. It carries **no URL, host, or secret**: the
  actual Google Sheets endpoints live in Kiln's connector adapter (in code), never in your model.
- **Nango** holds the OAuth connection to the live account and mints fresh access tokens on demand.
- **Kiln's service** (`apps/service`, or the hosted functions) holds the Nango **secret key** and
  brokers every call. Your browser never sees the secret — only a short-lived session token used to
  run the OAuth popup.
- **The generated agent runtime** resolves a fresh token from Nango at call time, calls Google Sheets
  directly, and drops the token. The token is never written to disk, your model, or the logs.

## Choose your Nango

The Nango instance is a **runtime binding you choose** — you point Kiln (and any app it generates) at it
with two variables, `NANGO_HOST` + `NANGO_SECRET_KEY`. There are **three equal options**; none is
privileged, and **self-hosting is never required**:

1. **Nango Cloud** — nothing to run. Use `NANGO_HOST=https://api.nango.dev` and the secret key from your
   Nango Cloud environment.
2. **An existing Nango** — your company already runs one. Point `NANGO_HOST` at it and use its secret key.
3. **A local Nango (optional helper)** — for developing connectors on your machine, Kiln ships a
   convenience: `./kiln.sh nango:up`. It boots a local Nango with docker compose, generates the required
   `NANGO_ENCRYPTION_KEY`, and prints the next steps. `./kiln.sh nango:down` stops it. This is a
   convenience only — Cloud or an existing instance work identically.

Whichever you choose, the setup is the same shape: **configure the Google integration in Nango → set the
`NANGO_*` variables → grant + connect → run.**

## Setup

Connectors are only needed when an agent is actually granted one. Set these on the **server** (your
`.env`, or your host's environment) — never in the browser and never in the committed model:

| Variable | What it is |
| --- | --- |
| `NANGO_SECRET_KEY` | Your Nango **secret** key. Server-side only. |
| `NANGO_HOST` | The Nango you chose (above). Defaults to `https://api.nango.dev`; a local helper serves `http://localhost:3003`. |
| `NANGO_PROVIDER_CONFIG_KEY` | The Nango integration id whose OAuth scopes back the connection (e.g. `google-sheets`). |

In Nango, create a **Google Sheets integration** and note its integration id. Kiln recommends one
integration per **scope tier** — a read-only one and a read/write one — so a connection only carries
the scopes its granted operations need.

### Self-hosting posture

Nango is a point of trust concentration: it holds every connected account's tokens. Running your **own**
Nango instance keeps those tokens inside your infrastructure — that's why the local helper exists — but
it's a posture you *may* choose, not one Kiln forces. Kiln talks to Nango's REST API with a plain `fetch`
(no SDK), so the generated app stays dependency-light. Prefer a **scoped** secret key (least privilege)
where your Nango supports it.

## The secret never reaches the browser

This is a hard rule (Kiln's golden invariant #3). The browser calls Kiln's server routes:

- `POST /api/connectors/session` — the server mints a short-lived Nango **Connect session token** and
  returns *only* that token. The secret stays on the server.
- `GET /api/connectors/connections` — returns a **non-secret** status list (which connections are
  live), so the app can show readiness without ever exposing a token.

On a keyed hosted instance these routes require the studio passphrase (`KILN_STUDIO_TOKEN`), exactly
like the other API routes.

Under the hood, the session route calls Nango's `POST /connect/sessions`, and readiness/token lookups use
Nango's **plural** connection endpoints (`GET /connections`, `GET /connections/{id}?...&force_refresh`) —
the current, non-deprecated API.

## In an exported app: connect an account without Studio

An app Kiln generates is **self-sufficient**: you can point it at *any* Nango and connect an account there
without coming back to Studio. The export references an **external** Nango (it does not bundle its own) —
you choose which one exactly as above, by setting `NANGO_*` in the app's environment.

- **The variables.** The generated `.env.example` includes the `NANGO_*` block (names only — the secret's
  value goes in your `.env`, never the committed model). The generated `docker-compose.yml` and README
  point you at them.
- **The Connect panel.** Run the agents service (`cd agents && pnpm serve`) and open
  **`http://localhost:3100/connect`**. It mints a Nango Connect session **on the server** (the browser only
  ever receives a short-lived token), opens Nango's hosted OAuth flow, and shows which accounts are live —
  the same server-mediated pattern as the Studio, minimized to *connect + status*.
- **An optional co-located Nango.** If you want an all-in-one box, the generated compose file carries an
  opt-in `nango` profile: `docker compose --profile nango up -d`, then set `NANGO_HOST=http://nango-server:3003`.
  It is **off by default** — the app reaches whichever external Nango you configure. (Set `NANGO_ENCRYPTION_KEY`,
  a base64 32-byte value, for the co-located instance.)

The secret stays server-side in every one of these paths (golden invariant #3): the app's own backend holds
`NANGO_SECRET_KEY` and brokers the calls, exactly like the Studio service does.

## Granting a connector in the Studio

Open an agent on the **Agents** stage and switch to its **Tools** tab. Granting is deliberately split
into three separate acts, so a human knowingly authorizes each one:

1. **Suggest.** Kiln may propose a grant grounded in the agent's goal — for example, a lead-handling
   agent gets a Spreadsheet suggestion. Suggestions are inert: you **accept each one at a time**, or
   dismiss it. There is deliberately **no "accept all"**.
2. **Grant.** A granted connector shows a per-operation control **grouped by kind** — read/list ops
   are visually separated from the write/send/delete ops, which are marked *mutating*. Each operation
   has an on-demand "what this lets the agent do" explanation. Ticking an operation is a **reversible
   model edit with no real-world effect** — it changes your model, nothing else. A per-grant
   **Autonomous** toggle (default off) governs whether the runtime's write gate applies.
3. **Connect a live account.** A separate, deliberately-confirmed step names the provider and the
   **scopes being authorized**, then mints the Nango Connect session on the server and runs the OAuth
   flow. Your browser only ever receives the short-lived session token.

### Honest readiness

Each grant carries a **shape + text** status (never colour alone):

- **granted (no live connection)** — the authority exists in the model, but no account is connected.
- **connected** — a live Nango connection is bound.
- **error** — a bound connection reference no longer resolves (revoked at Nango, or a failed check).

The status is rolled up per agent **pessimistically**: an agent only reads as *connected* when every
one of its grants is connected. A grant with no live account never looks wired.

### Real scopes, revoke, and the authority view

Once connected, the grant shows the **scopes the granted operations need**. (A Nango token carries the
integration's configured scopes, which can exceed a single grant's needs — Kiln surfaces the over-grant
when the connection reports its live scopes, and recommends one integration per scope tier.)

**Revoke** removes the grant and detaches its connection reference. It does **not** delete the Nango
connection itself — do that in Nango.

A per-project **Granted authority** view lists every agent × connector × operation × connection in one
place, so you can audit what the whole project has been granted at a glance.

### Test runs stay mock by default

Testing an agent (the **Runs** tab) uses **mock** tool dispatch — nothing hits a real system. A
separate, distinctly-badged "run against the live connection" consent is opt-in and only available once
a grant is connected.

## Reading untrusted data, then writing: the write gate

The core risk with a connector is prompt injection — an agent reads attacker-controlled data and then
performs a write. So the generated runtime **gates every write**. An operation whose kind is
`write`, `send`, or `delete` will **not run autonomously**: the runtime routes it for human approval
and does not execute it until approved. Reads and lists run directly.

You can mark a specific grant **autonomous** to let its writes run without a prompt — do this only
when you trust the data the agent reads. The Spreadsheet connector is a deliberately low-blast-radius
first proof (a spreadsheet, not an inbox).

Every connector call is written to a **secret-free audit log** — who ran what, against which
connection, and the outcome. The token and the response body are never logged.

## What's declared where

Your committed model (`model.json`) records only the **grant** — which agent may use which operations
of which connector, and an **opaque** connection reference (never an email, tenant id, or token). The
provider endpoints and the OAuth secret live outside the model: the endpoints in Kiln's code, the
secret in your server `.env`. That separation is what keeps a connector from becoming a generic
"call any URL" tool.
