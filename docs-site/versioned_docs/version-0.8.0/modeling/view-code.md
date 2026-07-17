---
sidebar_position: 9
title: View code
---

# View code — the payoff

**Why.** The last item on the rail turns your model into a technical blueprint — a strong starting point
for developers.

**How.** The **View code** panel presents your model across tabs: data types, an API, on-screen structure,
permissions, processes, agents, and deployment. Below the tabs are just three controls, so it's clear where
to click:

- **✨ Improve with AI** — a menu of optional AI passes over the generated app: **Code review** and
  **Auto-fix** (find and fix code issues), **Verify app** and **Auto-fix & verify** (build, run and
  self-heal in a sandbox), and **Polish layout** and **Visual review** (design passes — see below). Each
  item spells out what it does in one line, and every pass proposes changes you review and approve before
  anything is applied.
- **▶ Run app** — boots the generated app **locally** and opens it in a new browser tab (see below).
- **⤓ Export** — a menu: download just the **scaffold**, a **runnable app** with AI-written logic, or the
  whole **Full stack** project, each as a zip. Export stays **locked (🔒)** until the whole-model
  coherence check below passes.

The controls read as a sequence: **① Improve with AI** (optional) → **② Run app** (optional) →
**③ Final step — whole-model coherence** → **Export**.

## ③ Final step — the whole-model coherence check

Kiln builds your model one layer at a time, each layer from the one above. That means an individual layer
can look fine while the **whole model doesn't hang together** — a capability with a screen but no
behaviour behind it, an entity nothing operates, a dangling reference between layers. Before you can
export, Kiln runs a final coherence check and **gates export on it**.

The card shows a deterministic **coherence score** (the share of capabilities whose chain is complete —
an entity, behaviour, and a role or agent that owns it) plus a per-column count. Export unlocks only when:

- **No broken chains.** A capability missing its entity or its behaviour is a hard break (nothing operates
  it) — listed by name, and it **blocks export** until you fix the model. Dangling/orphan references
  across layers block it too.
- **Soft gaps acknowledged.** A capability that *is* operated but has no role or agent owner is a soft
  gap — it doesn't block, but you must tick **"I've reviewed the whole-model coherence"** to proceed.
- **The whole-model review has run.** Click **Run whole-model review** and an AI reviewer reads every
  layer together and reports whether they tell one coherent story. It's required at least once. Its
  findings are advisory — they don't hard-block — but any **concern** it raises must be **acknowledged**
  before export.

When everything clears, the card turns green — *"Coherence check passed — ready to export"* — and the
Export lock disappears. The score is recomputed live from your model, so fixing the model in an earlier
stage and returning here updates it.

The **Full-Stack** export is a runnable app, not just a mockup: the shadcn UI **fetches real data** from
the generated command API (spine) and drives its actions, and it uses real shadcn components — a
sortable/filterable **data table** with per-row action menus, a slide-over **detail sheet**, **tabs** for
related records, and a **chart** of the KPI breakdown. Point it at the backend with `VITE_API_URL`. It's
still a starting point developers extend by hand — but a running one.

## Completion briefs — a guided handoff for each command

Kiln generates the **structure**; the actual business logic inside each command is left for a developer
(or a coding agent) to complete. To make that handoff precise, every export now includes a **completion
brief** per command — `briefs/<command>.md`, indexed by `BRIEFS.md` and linked from `TODO.md`.

Each brief separates two things honestly:

- **LOCKED by the model** — everything Kiln can derive: the command's typed **input fields**, what
  **triggers** it (a workflow step or a policy reaction), the **events** it emits on success, the
  **roles** allowed to call it, and whether any step is **delegated** to an external service. Each line
  names its source in the model. These are regenerated on export — you change them in the model, not in
  the brief.
- **DECIDE — not in the model** — the genuine business logic Kiln *cannot* know: the precondition/guard,
  the actual state change, side effects and ordering, error handling. These come as an explicit
  checklist, never as invented pseudo-code that looks authoritative.

The result is a completer — human or AI — that knows exactly what is already decided and what is theirs
to write, without needing the original modeling session's context.

## Where each engine runs — deployment placement

Kiln's binding already says **which** engine hosts each part of your system (Postgres for data, n8n for
orchestration, a generated spine for the rest). You can also say **where** each one runs — **local** (a
docker-compose container), **selfhost** (the same image on your own remote box), or **managed** (a hosted
service you only point at, like Neon Postgres, n8n Cloud, or the spine on Fly.io). Edit it in
**Settings → Deployment placement** — a per-engine picker (where it runs, which target, its reach
variable) that flags invalid combinations as you go — or directly under `binding.hosting` in `model.json`.

When you place an engine remotely, the export adjusts itself: the managed engine is **pruned from
`docker-compose.yml`** (you don't run RDS in a local container), its **reach variable** (`DATABASE_URL`,
`N8N_BASE_URL`, …) is added to `.env.example` as a placeholder for you to fill (a credential is never
baked in), per-target config is emitted where it applies (e.g. `spine/fly.toml`), and a **`PLACEMENT.md`**
table plus a machine-readable `deployment.json` record exactly where everything runs. With no placement
set, every engine defaults to local and the export is unchanged. This is what makes "run each part locally
or remotely, in any combination" a real, exportable choice rather than hand-editing after the fact.

Each entry in `binding.hosting` is `{ mode, target?, urlEnv?, url? }` where `mode` is `local`,
`selfhost`, or `managed`. The built-in deploy `target`s are **`docker`** (local/self-hosted container),
**`managed`** (any engine, reached via an env var), **`vercel`** (the UI), and **`fly`** (the spine); more
can be added as plugins. `url` is a non-secret host hint only — put credentials in `.env` at deploy time.

## ✨ Polish layout — an automatic design pass

Click **✨ Polish layout** and a senior-designer AI reviews every generated screen against UX best practices
in Kiln's design language and proposes improvements: a clear row title, hiding raw ids and technical
fields, the right formats (money, dates, badges for statuses), a sensible column selection and form
order, and a one-line screen description. It can also switch a screen to a richer layout when the data
invites it — **KPI tiles** (totals/counts) above the list, a **card grid**, or a **kanban board** grouped
by a status/stage field (great for pipelines like leads, orders, or tickets). It **iterates** each screen
toward the guidelines, then shows
you the changes **per screen to accept or skip** — nothing is applied until you say so. Apply, then
**Run app** or export to see the result. The polished layout flows into all three: the **Run app** preview,
the single-file app, and the **Full-Stack** shadcn export (its list pages render the chosen board/cards/KPI
tiles with real shadcn components). It changes *information design* (layout data), never code, so it
can't break the build. Web research and the interview aside, it runs on your selected
[engine](../reference/choosing-an-engine).

**👁 Visual review** goes one step further: it boots the app locally, **screenshots each screen**, and an
AI critiques what it actually *sees* — spotting an empty or unbalanced layout, a pipeline that should be a
board, missing KPI tiles — then proposes the same accept/skip improvements. It needs the local service and a
local Chrome/Chromium installed (set `KILN_CHROME` to point at a specific one); if none is found it says so
rather than failing.

## Run app — see the outcome before you export

Click **▶ Run app** to actually use the software your model describes, before you commit to it. Kiln
starts the generated app on your own machine and opens it in a **new tab**: a working admin UI with a
screen per entity, typed create forms, the actions (commands) you modelled, and a live event log — backed
by a real database, so records you create persist and commands fire real events.

This closes the loop: **describe → adjust the model → run it → see the result → export.** It needs the
local service running (you'll see "Server" storage in the sidebar) and Node ≥ 22, and it works fully
offline — no account, no cloud, no build step. The preview is a fast, dependency-light stand-in for the
polished client in the export; use **Export → Full-Stack** when you're ready to hand it to developers.

:::note model.json is the source of truth
The exported repo carries a complete `model.json` — every layer of your business as one versionable
document. It's the durable record the generated code (and any regeneration) is built from. Commit it to
git; import it to recall and iterate. See [Protecting your fixes](../reviewing/protecting-your-fixes).
:::
