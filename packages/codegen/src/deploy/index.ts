/**
 * @kiln/codegen/deploy — registers the built-in deploy targets (SPEC-012) as an import side effect, and
 * re-exports the registry API. Importing this module makes `docker`, `managed`, `vercel`, and `fly`
 * available to placement validation + projection. Add a target: create a file here, register it below.
 */
import { registerDeployTarget } from "./registry.ts";
import { DOCKER } from "./docker.ts";
import { MANAGED } from "./managed.ts";
import { VERCEL } from "./vercel.ts";
import { FLY } from "./fly.ts";

registerDeployTarget(DOCKER);
registerDeployTarget(MANAGED);
registerDeployTarget(VERCEL);
registerDeployTarget(FLY);

export { registerDeployTarget, getDeployTarget, registeredDeployTargets, type DeployTarget, type DeployContext, type DeployOutput } from "./registry.ts";
export { DOCKER } from "./docker.ts";
export { MANAGED } from "./managed.ts";
export { VERCEL } from "./vercel.ts";
export { FLY } from "./fly.ts";
