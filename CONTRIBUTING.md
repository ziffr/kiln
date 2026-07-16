# Contributing to Kiln

Thanks for your interest in **Kiln**. Kiln is
an LLM-guided **business compiler**: you describe a vertical business in structured text, an LLM derives a
formal model, deterministic validators check it, and it renders as a reviewable **Capability
Map** that deterministic codegen projects into a complete, runnable multi-backend system.

This project is welcoming to contributions of all sizes — from typo fixes to whole new
execution engines. Please read this guide before opening a pull request.

## How this project is maintained

Kiln has an unusual — but deliberate — maintenance model. A non-technical **Product Owner** sets
the vision and priorities, and an **AI Maintainer** (Claude) does all of the technical work:
reviewing every pull request, keeping CI green, and cutting releases. This means:

- **Every PR is reviewed and merged by the AI Maintainer.** Reviews are thorough and focus on
  correctness, tests, the project invariants, and security.
- **Green CI is required to merge.** No exceptions. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
- **Product and scope questions go to the Owner** (via the `needs-owner-decision` label), who
  answers in plain language.

For the full picture, read [GOVERNANCE.md](GOVERNANCE.md).

## Getting set up

You need **Node ≥ 22.18** (the first release with unflagged TypeScript type-stripping; CI runs Node
24). The packages have **no build step** — Node runs the TypeScript sources directly, so an older
Node (e.g. 20) fails the tests with `ERR_UNKNOWN_FILE_EXTENSION`. `npm install` only links the
workspaces (no registry fetch is required to run the tests).

```bash
./kiln.sh install     # install dependencies (links the npm workspaces; offline)
./kiln.sh doctor      # verify your environment (node, .env, docker, git)
```

`./kiln.sh help` lists every command. You do not need an Anthropic API key to develop or run the
tests — the app ships with an offline mock generator. A key is only needed for real LLM
generation, and it lives **only** in a git-ignored root `.env` (never commit it). See
[SECURITY.md](SECURITY.md).

New to the codebase? Read [DEVELOPER.md](DEVELOPER.md) — it maps the pipeline to the packages and
shows exactly *where to attack* for the three common changes (add an LLM provider, add an execution
engine, add a methodology layer).

## The check that must pass before you open a PR

```bash
./kiln.sh check       # runs the test suite + the web build — this is the gate
```

`./kiln.sh check` is exactly what CI runs: the package tests (`npm test`) and the web build
(`npm run build --workspace @kiln/web`). If it is green locally, CI should be green too. Please run
it before pushing. If you touch UI, also verify your change **in the browser** — several of the
project's invariants are visual, and tests alone will not catch a broken projection.

Every new pure function gets a test under `packages/*/test/*.test.ts` (we use Node's built-in
`node:test` + `node:assert/strict` — no test framework to install).

## Project invariants (please don't violate these)

These are the rules of the road. The full list lives in [CLAUDE.md](CLAUDE.md); the ones that most
often trip up new contributors:

1. **Text is the source of truth; the UI/graph is a projection of the model.** Never store truth in
   the canvas. Node positions are computed, never persisted.
2. **Every model node/edge is `authored` or `derived`.** Only `authored` elements round-trip to
   text and are editable; `derived` elements are read-only projections.
3. **Secrets never reach the browser.** The Anthropic key lives only in `apps/service`; the web app
   POSTs to the service and never calls the model or holds the key.
4. **Pure packages are isomorphic and dependency-free.** `@kiln/ir`, `@kiln/compiler`,
   `@kiln/validation`, `@kiln/narrative`, `@kiln/skills`, and `@kiln/eval` must run in both Node tests
   and the browser. **Do not import `node:*` builtins in them** (use the isomorphic `sha256` from
   `@kiln/ir`, not `node:crypto`). Only `@kiln/store` and `apps/service` may be server-only.
5. **The model proposes; validators + the human decide.** LLM output is coerced, validated, and
   human-editable. Generated capabilities must carry grounded provenance.

## Change the model, not the generated code

Kiln generates systems from a model. If output looks wrong, **fix the projection — change the model
or the generator, not the generated artifacts**. Hand-editing generated code will be overwritten on
the next export and is not how this project improves. (The rare exceptions — hand-owned adapters —
are documented in the ADRs under `docs/`.)

## Working with the LLM code

- The project is TypeScript, so LLM calls use the official **`@anthropic-ai/sdk`**, never raw HTTP,
  and that SDK usage lives **only** in `apps/service`.
- **Do not guess the Anthropic API.** Use structured outputs to lock JSON shapes, keep the one-shot
  repair retry, and wrap user/business text as data (prompt-injection safety).

## Branching

Kiln uses a **trunk-based** flow — the least-ceremony model that scales from one maintainer to many:

- **`main` is the trunk and production.** It is protected — **no direct pushes** (enforced for everyone,
  including admins); every change lands via a pull request. Vercel deploys `main` to production and
  release-please cuts releases from it.
- **Do the work on a short-lived branch, then PR into `main`:**
  - `feat/<slug>` · `fix/<slug>` · `docs/<slug>` · `chore/<slug>`.
  - Push the branch — Vercel builds a **preview deployment** for it automatically, so you can see your
    change live without touching production.
  - Open a PR (Conventional Commit title), get it green, review, merge. The branch **auto-deletes** on merge.
- **External contributors:** fork the repo, push to your fork, open a PR against `main`. No write access
  needed — the AI Maintainer reviews and merges.
- **No long-lived `develop` branch.** Per-branch preview deployments replace a staging branch, and
  release-please (trunk-based by design) cuts releases straight from `main`. To cut a release, **merge the
  release-please PR** — never hand-edit `package.json` / `CHANGELOG.md` / `.release-please-manifest.json`.

## Commit messages and PRs

- Use **[Conventional Commits](https://www.conventionalcommits.org/)** for commit messages and PR
  titles (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, …). This keeps the changelog and
  release notes readable.
- Fill out the [pull request template](.github/PULL_REQUEST_TEMPLATE.md) — say what and why, confirm
  `./kiln.sh check` passes, and note any tests you added.
- Keep PRs small and focused; a coherent, green unit of work is much easier to review and merge.

## Documentation

There are **two** kinds of docs, in two places:

- **Governance docs** — plans, specs, reviews, and decisions — live under `docs/` and follow
  [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) (ID prefixes, required frontmatter, status lifecycle).
  If you add or change a governed doc, update `docs/INDEX.md`.
- **The user-facing documentation site** lives under [`docs-site/`](docs-site/) (Docusaurus, published to
  GitHub Pages). **Contributions are welcome and expected** — if you add a feature, a connector, a backend
  adapter, or anything a user needs to configure (e.g. where API keys go), document it here in the same PR.
  Add a markdown page under `docs-site/docs/`; the sidebar picks it up automatically. See
  [`docs-site/README.md`](docs-site/README.md) for how to add a page and preview it locally. The docs site
  is **not** part of the root `npm install` — you only install its tooling if you want to preview.

Both merge through the normal PR flow; `docs-site/**` is code-owned, so a maintainer reviews every docs
change just like code.

## Automation

A couple of things happen automatically. **Releases are cut by
[release-please](https://github.com/googleapis/release-please)**: because commits follow
Conventional Commits, it keeps a standing "Release PR" that bumps the version and updates
`CHANGELOG.md`, and merging that PR tags the release and publishes it (see
[RELEASING.md](RELEASING.md)) — so you never hand-edit the changelog. You can also mention
**`@claude`** on an issue (or in a PR comment) to ask the **AI Maintainer** to draft a fix as a pull
request. Anything it produces is a normal PR: it still runs through CI and review before merge, and
nothing auto-merges.

## Good places to start

- Issues labelled **`good first issue`** are scoped for newcomers.
- Want to add a new execution engine (a store, orchestrator, UI, or platform)? Use the
  **[new-engine issue template](.github/ISSUE_TEMPLATE/new-engine.md)** to propose it first — it
  asks the right questions (which tech-capabilities it provides, at what fidelity, its reach, and
  whether it couples its own store).
- General questions? Open a **GitHub Discussion** rather than an issue.

Welcome aboard.
