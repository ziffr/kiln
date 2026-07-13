# Governance

VerticalBusinessDesigner (VBD) is maintained under a deliberately unusual model. This document
describes it honestly, so that contributors know exactly how decisions get made and how their pull
requests get reviewed and merged.

## Two roles

### Product Owner — Stefan Sonntag ([@ziffr](https://github.com/ziffr))

The Owner holds the **product vision**. He decides what VBD is for, what belongs in it, and what
does not. Concretely, the Owner:

- sets direction, priorities, and the roadmap;
- gives **go / no-go** decisions on scope — whether a feature, engine, or change fits the product;
- resolves questions that are about *product and value*, not code.

The Owner is **not a developer**. He does not review code, merge pull requests, cut releases, or
handle git/repository mechanics. He interacts in plain language.

### AI Maintainer — Claude

The AI Maintainer does **all of the technical work** on the Owner's behalf:

- **reviews every pull request** for correctness, tests, the project [invariants](CLAUDE.md), and
  security;
- decides whether a change is mergeable, and requests changes when it is not;
- keeps **CI green** and the `main` branch healthy;
- **cuts releases** (tagging, changelog, GitHub Releases — see [RELEASING.md](RELEASING.md));
- handles the git and repository mechanics the Owner does not.

The AI Maintainer defers to the Owner on product and scope, and only on product and scope.

## How a change gets merged

```
contributor opens a PR
        │
        ▼
   CI must pass  ──✗──▶  contributor fixes until green (required, no exceptions)
        │ ✓
        ▼
AI Maintainer reviews  ──▶  requests changes ──▶ contributor revises ──▶ (re-review)
        │ approves
        ▼
 scope/product question?  ──yes──▶ Owner consulted in plain language
        │ no                                    │ (never about code)
        ▼◀───────────────────────────────────────┘
AI Maintainer merges, then releases when appropriate
```

The rules that make this safe:

1. **Green CI is required to merge.** CI runs the exact local gate — the package tests and the web
   build (`./vbd.sh check`). See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
2. **The AI Maintainer reviews and approves before merge.** No change lands unreviewed.
3. **The Owner is consulted only on product/scope**, never on code, and answers in plain language.

## Branch protection (recommended)

The repository should protect `main` with:

- **Require a pull request before merging** — no direct pushes to `main`.
- **Require status checks to pass** — the `test-and-build` CI job must be green.
- **Require at least 1 approving review** — the AI Maintainer's review.
- **Require branches to be up to date** before merging.
- **Include administrators** in these rules, so the process holds for everyone.

## Labels

The project uses a small, consistent set of labels:

| Label                  | Meaning                                                              |
| ---------------------- | ------------------------------------------------------------------- |
| `good first issue`     | Well-scoped and approachable for a newcomer.                        |
| `new-engine`           | Proposing or contributing a new execution engine (store / orchestrator / UI / platform). |
| `bug`                  | Something is broken.                                                 |
| `enhancement`          | A new feature or improvement.                                       |
| `needs-owner-decision` | Blocked on a product/scope call from the Owner.                     |

## How the Owner interacts

The Owner participates in plain language. He might comment on an issue or PR with something like
"yes, ship this," "not now — out of scope," or "make it simpler for a non-technical user." The AI
Maintainer **translates that intent into technical action**: turning a go/no-go into a merge or a
close, a priority into a milestone, a vague concern into concrete review feedback. Contributors
never need the Owner to understand code — that is the Maintainer's job.

## Amending this model

Changes to this governance model are a product decision: the Owner approves them, and the AI
Maintainer implements them as a normal, reviewed pull request.
