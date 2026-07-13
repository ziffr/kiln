# Releasing

Releases are cut by the **AI Maintainer** (see [GOVERNANCE.md](GOVERNANCE.md)). This document is the
process it follows. Releasing is **automated with
[release-please](https://github.com/googleapis/release-please)** — the AI Maintainer's job is to
review and merge, not to tag by hand.

## Versioning

VBD is versioned at the **repository level** using [Semantic Versioning](https://semver.org/). VBD
is an application and monorepo, **not** a set of npm packages published to a registry — so the
version describes the product as a whole, not individual packages. The version lives in the root
[`package.json`](package.json) (release-please reads and bumps it there).

| Bump      | When                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------ |
| **PATCH** (`x.y.Z`) | Bug fixes and small, backward-compatible corrections (`fix:` commits).                 |
| **MINOR** (`x.Y.0`) | New execution engines, new modeling capabilities, and other backward-compatible features (`feat:` commits). |
| **MAJOR** (`X.0.0`) | Breaking changes to the **model schema** or the **engine contract** (the tech-capability taxonomy engines implement). |

We're **pre-1.0**, so release-please runs with `bump-minor-pre-major: true`: while the version is
`0.y.z`, a breaking change (`feat!:` / a `BREAKING CHANGE:` footer) bumps the **MINOR** version, not
MAJOR. The first `X.0.0` MAJOR bump is reserved for the deliberate 1.0 release; until then breaking
changes surface in the notes but keep the leading `0`.

### The three version surfaces

The repository SemVer above is one of **three** independent version surfaces; do not conflate them:

1. **Repository SemVer** (`package.json` / the `vX.Y.Z` git tag) — the product as a whole, managed
   by release-please as described here.
2. **`MODEL_SCHEMA_VERSION`** — the version of the persisted model document (`model.json`). It moves
   on its own cadence when the model's shape changes; a breaking change here is one of the triggers
   for a repository MAJOR (or, pre-1.0, MINOR) bump.
3. **The engine contract** — the tech-capability taxonomy that execution engines implement. A
   breaking change to this contract likewise drives a repository MAJOR (pre-1.0: MINOR) bump.

## The automated flow

Because we mandate [Conventional Commits](https://www.conventionalcommits.org/), release notes and
version bumps are derived automatically:

1. **Land Conventional-Commit PRs on `main`.** Each merged PR's commit type (`feat`, `fix`, `docs`,
   `refactor`, `perf`, …) is what release-please reads.
2. **release-please opens/updates a Release PR.** On every push to `main`, the
   [`release-please`](.github/workflows/release-please.yml) workflow
   (`googleapis/release-please-action@v4`, `release-type: node`) maintains a standing "release PR"
   that bumps the version in [`package.json`](package.json) and rolls the accumulated changes into
   [`CHANGELOG.md`](CHANGELOG.md) under the right headings (see
   [`release-please-config.json`](release-please-config.json)).
3. **The AI Maintainer reviews + merges the Release PR.** Merging it is the act of cutting the
   release. Do this when `main` is green and the accumulated changes are a coherent release.
4. **The tag and GitHub Release are created automatically.** On merge, release-please tags
   `vX.Y.Z` on `main` and publishes the GitHub Release with the generated notes — no manual tagging,
   no separate release workflow.

The version pin lives in [`.release-please-manifest.json`](.release-please-manifest.json)
(`{ ".": "X.Y.Z" }`); release-please updates it as part of the Release PR. You should not edit it by
hand.

## Notes

- **Do not tag by hand and do not hand-edit `CHANGELOG.md`.** release-please owns tagging, the
  GitHub Release, and the changelog going forward. Manual tags will double-publish or drift from the
  manifest.
- Tags always match the pattern `vX.Y.Z` (`include-component-in-tag: false` — no package component
  in the tag).
- There is no npm publish step — the packages are `private` and consumed within the monorepo.
- **One-time repo setting:** release-please opens its Release PR using the built-in `GITHUB_TOKEN`,
  so **Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests"**
  must be enabled, or the workflow cannot open the Release PR.
