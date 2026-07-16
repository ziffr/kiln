/**
 * DOCKER — the default local/selfhost container target (SPEC-012). The generated docker-compose.yml IS
 * this target's artifact, so `generate` adds no files; it only contributes a PLACEMENT.md row. `selfhost`
 * = the same compose image run on a remote box the operator owns (so the local service stays; nothing is
 * pruned). This is the target every engine falls back to when no `hosting` is authored (mode "local").
 */
import type { DeployTarget } from "./registry.ts";

export const DOCKER: DeployTarget = {
  id: "docker",
  name: "Docker Compose",
  modes: ["local", "selfhost"],
  hosts: () => true, // any engine can run as a local/self-hosted container.
  generate: (ctx) => ({
    reach:
      ctx.hosting.mode === "selfhost"
        ? `run \`docker compose up ${ctx.composeService}\` on your own host; point dependants at it via \`${ctx.hosting.urlEnv ?? "its URL"}\`.`
        : "`docker compose up` (runs in a container on this machine).",
  }),
};
