---
id: REV-027
title: SPEC-012 review — technical-architecture lens
type: review
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-15
updated: 2026-07-15
reviews: SPEC-012
lens: technical-architecture
verdict: Approve-with-changes
---

# REV-027 — SPEC-012, technical-architecture

**Verdict: Approve-with-changes.** Placement is genuinely orthogonal (no `TechCapability` leakage); the
compose-block refactor is byte-identical for the all-local default in both dialects (verified by diff
against `HEAD`); the deploy registry is deterministic and the `targets → deploy` cycle is type-only
(erases under type-stripping). Three managed-path correctness gaps must land before `Approved`.

## Findings

1. **[Major] §4.3 seam-URL parameterization claimed but not implemented.** `deriveSeams`/`EngineContext`
   carry no placement; the n8n adapter's base URL stays `http://spine.local/api`. Only the compose
   `environment` block is repointed. → **Fixed (descope):** §4.3/§5/§6/§8 reworded — seam-URL auto-wiring
   is Phase 2b; Phase 2a is compose+env only.
2. **[Major] Duplicate `.env.example` reach var.** Base emits uncommented `DATABASE_URL=…localhost` and the
   managed target appended a second `DATABASE_URL` — a conflicting env file. → **Fixed:** base var is
   placement-aware (commented placeholder when managed); append deduped via `ENV_OWNED`; test asserts the
   count.
3. **[Major] Bare-`managed` engine (no target) silently exported local** (validator skipped, projection
   no-op). → **Fixed:** generic `managed` now hosts it; `validatePlacement` resolves the fallback target and
   emits PB2 when it can't host. Tests cover both paths.
4. **[Minor] Byte-identity gate asserted but not automated.** → **Fixed:** committed compose-snapshot test.
5. **[Minor] PB1 unreachable for shipped engines** (always defaulted `urlEnv`). → **Accepted** — documented;
   PB2 fallback check now covers the real built-in failure mode.
6. **[Minor] gaps-line mislabels PB errors as "bindings".** → **Fixed:** reworded to "binding/placement errors".
7. **[Minor] PB4 hard-coded odoo/postgres.** → **Accepted/Deferred** — noted as a Phase-2a limitation;
   generalization over `couplesStore` engines is 2b.
8. **[Nit] Empty `services:` body theoretically reachable.** → **Fixed:** guard emits a comment placeholder;
   test asserts non-empty YAML.

## Closure
All Majors fixed or descoped; Minors/Nits fixed or accepted with rationale. No Blocker. Verdict satisfied.
