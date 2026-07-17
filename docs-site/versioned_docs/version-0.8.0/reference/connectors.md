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

## Setup

Connectors are only needed when an agent is actually granted one. Set these on the **server** (your
`.env`, or your host's environment) — never in the browser and never in the committed model:

| Variable | What it is |
| --- | --- |
| `NANGO_SECRET_KEY` | Your Nango **secret** key. Server-side only. |
| `NANGO_HOST` | Your Nango instance. Defaults to `https://api.nango.dev`; **self-hosting is recommended**. |
| `NANGO_PROVIDER_CONFIG_KEY` | The Nango integration id whose OAuth scopes back the connection (e.g. `google-sheets`). |

In Nango, create a **Google Sheets integration** and note its integration id. Kiln recommends one
integration per **scope tier** — a read-only one and a read/write one — so a connection only carries
the scopes its granted operations need.

### Self-hosting posture

Nango becomes a point of trust concentration: it holds every connected account's tokens. Running your
**own** Nango instance (`NANGO_HOST`) keeps those tokens inside your infrastructure. Kiln talks to
Nango's REST API with a plain `fetch` (no SDK), so the generated app stays dependency-light.

## The secret never reaches the browser

This is a hard rule (Kiln's golden invariant #3). The browser calls Kiln's server routes:

- `POST /api/connectors/session` — the server mints a short-lived Nango **Connect session token** and
  returns *only* that token. The secret stays on the server.
- `GET /api/connectors/connections` — returns a **non-secret** status list (which connections are
  live), so the app can show readiness without ever exposing a token.

On a keyed hosted instance these routes require the studio passphrase (`KILN_STUDIO_TOKEN`), exactly
like the other API routes.

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
