/**
 * @kiln/codegen/deploy/registry — the DEPLOY-TARGET SEAM (SPEC-012), the deploy-half twin of SPEC-010.
 *
 * SPEC-010 made execution ENGINES pluggable (which engine hosts a capability). This makes DEPLOY TARGETS
 * pluggable (WHERE that engine runs). A target is REGISTERED, not hardcoded: adding Vercel/Fly/Railway is
 * one file + one `registerDeployTarget(...)` line, with no edit to the placement projection.
 *
 * A target does NOT provision infrastructure (no network, no secrets — SPEC-012 non-goal). It PROJECTS a
 * placement into descriptors: config files, extra .env reach vars, compose-service pruning, and a
 * PLACEMENT.md row. Pure + isomorphic (invariant #4): NO node:*, so the browser export keeps working.
 */
import type { HostingMode, HostingSpec } from "../targets.ts";

/** Everything a deploy target needs to project one engine's placement. Pure/isomorphic. */
export interface DeployContext {
  engineId: string;
  engineName: string;
  hosting: HostingSpec;
  dialect: "postgres" | "sqlite";
  /** app slug — for naming generated config (e.g. the Fly app name). */
  domainSlug: string;
  /** this engine's docker-compose service name (resolved by the caller from the engine registry), so a
   *  target prunes the RIGHT service — including a third-party engine's self-declared service name. */
  composeService: string;
}

/**
 * What a target contributes for one engine. All fields optional — a target emits only what it owns.
 * A target NEVER formats markdown or emits a credential value: it returns structured data and the
 * projector renders it (SPEC-012 review REV-031: `note` was a leaky abstraction; `reach` replaces it).
 */
export interface DeployOutput {
  /** files the target owns (relative paths), e.g. `{ "spine/fly.toml": "…" }`. */
  files?: Record<string, string>;
  /** extra `.env.example` reach vars (var name → a COMMENTED placeholder line; never a credential value). */
  env?: Record<string, string>;
  /** docker-compose service names this engine no longer needs locally (managed engines prune themselves). */
  prunesComposeService?: string[];
  /** the "how to reach / deploy" instruction cell for the PLACEMENT.md row (plain text, no table syntax). */
  reach?: string;
}

/** The plugin unit. `hosts` gates which engines/modes this target can place; `generate` projects one. */
export interface DeployTarget {
  id: string;
  name: string;
  /** the hosting modes this target supports. */
  modes: HostingMode[];
  /** true when this target can host the given engine placement (by engine id / capability family). */
  hosts(ctx: DeployContext): boolean;
  generate(ctx: DeployContext): DeployOutput;
}

const REGISTRY = new Map<string, DeployTarget>();

/** Register a deploy target. Built-ins do this at import time (deploy/index.ts); a future package could too. */
export function registerDeployTarget(t: DeployTarget): void {
  REGISTRY.set(t.id, t);
}

/** Look up a target by id (used by placement validation + projection). */
export function getDeployTarget(id: string): DeployTarget | undefined {
  return REGISTRY.get(id);
}

/** All registered targets, DETERMINISTICALLY SORTED BY ID (iteration for output must not depend on order). */
export function registeredDeployTargets(): DeployTarget[] {
  return [...REGISTRY.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
