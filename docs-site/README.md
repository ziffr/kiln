# Kiln Studio documentation site

The user-facing documentation for Kiln Studio, built with [Docusaurus](https://docusaurus.io/) and
published to **GitHub Pages** at <https://ziffr.github.io/kiln/>.

**This project is intentionally not a repo workspace.** It has its own `package.json`, so the repo's root
`npm install` — and a contributor's clone — never pull the docs tooling. You only install it if you want
to preview the site. The docs *content* (the markdown) is always in the repo and editable by anyone via a
PR.

## Contributing docs

Everyone is welcome to improve the docs — and if you add a feature, a connector, or a backend adapter,
**document it here in the same PR** (how it works, how to configure it, where any keys go). It merges
through the normal PR flow; `docs-site/**` is code-owned, so a maintainer reviews it.

### Add or edit a page

1. Add a markdown file under `docs/` (or edit an existing one). Use frontmatter for the title and order:

   ```md
   ---
   sidebar_position: 3
   title: My connector
   ---

   # My connector
   ...
   ```

2. The **sidebar is generated** from the folder structure — a new file just appears. Group related pages
   in a folder with a `_category_.json` (see `docs/reviewing/_category_.json` for an example).
3. Link between pages with **relative markdown links** (e.g. `[Fixing](../reviewing/fixing-concerns)`).
   The build fails on broken links, so they stay honest.

### Preview locally (optional)

```bash
cd docs-site
npm install        # first time only — installs Docusaurus here, not in the repo root
npm start          # dev server with hot reload → http://localhost:3000/kiln/
npm run build      # production build (what CI runs); catches broken links
```

## Versioning

- `docs/` is the **live / “Next”** version — edit here.
- Released versions are **snapshots** under `versioned_docs/` (e.g. `version-0.1.0/`). **Don't hand-edit
  snapshots** unless you're deliberately patching a released version. The maintainer cuts a new version at
  release with `npm run docusaurus docs:version <x.y.z>`.

## Translations (i18n)

English is the source language. German lives under `i18n/de/`. To scaffold translation files for a locale:

```bash
npm run write-translations -- --locale de
```

Untranslated pages fall back to English, so the site is always complete.

## Deployment

`.github/workflows/docs.yml` builds and deploys to GitHub Pages on any change under `docs-site/`. Going
live needs a one-time repo setting: **Settings → Pages → Source = “GitHub Actions.”**
