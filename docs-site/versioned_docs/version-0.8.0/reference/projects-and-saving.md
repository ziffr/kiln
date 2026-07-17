---
sidebar_position: 3
title: Projects & saving
---

# Projects & saving

- **Autosave** — your work saves automatically in your browser.
- **Projects** — click the project name (top-left) to open the **project manager**: every business as a
  card showing its description, size, and when you last edited it. From here you **switch** between them
  (click a card), and you can **rename**, **duplicate**, or
  **delete** any project, and once you have more than a handful, a **search box** filters by name or
  description. **Duplicate** forks the whole model under a new name (`… (copy)`) — the fastest way to try a
  variant without touching the original.
- **Export / Import model** — the up/down arrows export and import the whole model as a single
  `model.json` — your portable, versionable record of the business. Commit it to git to version it.
- **Versions** — when a server-backed workspace is available, each project's card in the manager has a
  **history** action (clock icon): it opens that project and lets you save named snapshots and restore an
  earlier one.

:::info model.json is the source of truth
`model.json` holds every layer — capabilities, entities, behaviour, automations, roles, workflows, agents,
and your hand-made fixes. It's what export and code generation build from. See
[Protecting your fixes](../reviewing/protecting-your-fixes).
:::
