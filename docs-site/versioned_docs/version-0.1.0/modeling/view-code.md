---
sidebar_position: 9
title: View code
---

# View code — the payoff

**Why.** The last item on the rail turns your model into a technical blueprint — a strong starting point
for developers.

**How.** The **View code** panel presents your model across tabs: data types, an API, on-screen structure,
permissions, processes, agents, and deployment. The toolbar groups three things:

- **Check** — have an AI review, auto-fix, and test the generated code, and **✨ Polish UI** (see below).
- **Run app** — boot the generated app **locally** and open it in a new browser tab (see below).
- **Export** — download just the scaffold, a runnable app with AI-written logic, or the whole
  **Full-Stack** project as a zip.

It's scaffolding, not the finished software — a base that developers extend by hand.

## ✨ Polish UI — an automatic design pass

Click **✨ Polish UI** and a senior-designer AI reviews every generated screen against UX best practices
in Kiln's design language and proposes improvements: a clear row title, hiding raw ids and technical
fields, the right formats (money, dates, badges for statuses), a sensible column selection and form
order, and a one-line screen description. It can also switch a screen to a richer layout when the data
invites it — **KPI tiles** (totals/counts) above the list, a **card grid**, or a **kanban board** grouped
by a status/stage field (great for pipelines like leads, orders, or tickets). It **iterates** each screen
toward the guidelines, then shows
you the changes **per screen to accept or skip** — nothing is applied until you say so. Apply, then
**Run app** or export to see the result. It changes *information design* (layout data), never code, so it
can't break the build. Web research and the interview aside, it runs on your selected
[engine](../reference/choosing-an-engine).

**👁 Visual polish** goes one step further: it boots the app locally, **screenshots each screen**, and an
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
