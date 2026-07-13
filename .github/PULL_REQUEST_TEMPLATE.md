<!--
Thanks for contributing to VerticalBusinessDesigner!
Every PR is reviewed and merged by the AI Maintainer (see GOVERNANCE.md), and green CI is required.
Please use a Conventional Commit style for the PR title (e.g. "feat: ...", "fix: ...", "docs: ...").
-->

## What & why

<!-- What does this change do, and why? Link any related issue (e.g. "Closes #123"). -->

## Checklist

- [ ] `./kiln.sh check` passes locally (package tests + web build — the CI gate)
- [ ] Tests added or updated for the change (`packages/*/test/*.test.ts`)
- [ ] Follows the project [invariants](../CLAUDE.md) — text is the source of truth; `authored` vs
      `derived`; secrets stay server-side; pure packages stay isomorphic and free of `node:*` imports
- [ ] Changes go in the model / generator, not in generated code
- [ ] UI changes verified in the browser (if applicable)
- [ ] Docs updated where relevant (and `docs/INDEX.md` if a governed doc changed)
- [ ] PR title uses [Conventional Commits](https://www.conventionalcommits.org/)

## Notes for the reviewer

<!-- Anything the AI Maintainer should know: trade-offs, follow-ups, open questions. -->
