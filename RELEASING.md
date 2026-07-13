# Releasing

Releases are cut by the **AI Maintainer** (see [GOVERNANCE.md](GOVERNANCE.md)). This document is the
process it follows.

## Versioning

VBD is versioned at the **repository level** using [Semantic Versioning](https://semver.org/). VBD
is an application and monorepo, **not** a set of npm packages published to a registry — so the
version describes the product as a whole, not individual packages.

| Bump      | When                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------ |
| **PATCH** (`x.y.Z`) | Bug fixes and small, backward-compatible corrections.                                  |
| **MINOR** (`x.Y.0`) | New execution engines, new modeling capabilities, and other backward-compatible features. |
| **MAJOR** (`X.0.0`) | Breaking changes to the **model schema** or the **engine contract** (the tech-capability taxonomy engines implement). |

The first public release is **0.1.0**.

## Release steps

1. **Make sure `main` is green.** CI (the `test-and-build` job) must be passing on the commit you
   intend to release. Locally, `./vbd.sh check` (tests + web build) should be green too.
2. **Update the changelog.** Move the accumulated entries under `## [Unreleased]` in
   [CHANGELOG.md](CHANGELOG.md) into a new `## [X.Y.Z] - YYYY-MM-DD` section, following the
   [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format. Leave a fresh, empty
   `## [Unreleased]` section at the top.
3. **Commit** the changelog update (Conventional Commit, e.g. `chore(release): 0.1.0`).
4. **Tag the release** on `main`:
   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```
5. **Publish the GitHub Release.** Pushing a `vX.Y.Z` tag triggers
   [`.github/workflows/release.yml`](.github/workflows/release.yml), which creates a GitHub Release
   from the tag with auto-generated release notes. Review the published release, and paste in the
   relevant `CHANGELOG.md` highlights if you want a curated summary.

## Notes

- Tags always match the pattern `vX.Y.Z` (this is what the release workflow listens for).
- Only tag commits that are on `main` and green.
- There is no npm publish step — the packages are `private` and consumed within the monorepo.
