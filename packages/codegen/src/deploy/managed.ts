/**
 * MANAGED — the GENERIC "point an env var at a remote instance" target (SPEC-012). For ANY engine you run
 * as a managed service (Neon/Supabase Postgres, n8n Cloud, Odoo.sh, or a third-party store): the engine's
 * local docker-compose service is PRUNED, and its reach env var (DATABASE_URL, N8N_BASE_URL, …) is emitted
 * as a COMMENTED placeholder the operator fills — we NEVER bake the value (a DSN can carry a credential;
 * REV-030). Hosts any engine in `managed` mode, so a third-party engine (SPEC-010) is placeable with no
 * core edit (REV-031). The UI/spine have their own richer targets (VERCEL/FLY) but may also use this.
 */
import type { DeployTarget } from "./registry.ts";

export const MANAGED: DeployTarget = {
  id: "managed",
  name: "Managed service",
  modes: ["managed"],
  hosts: (ctx) => ctx.hosting.mode === "managed",
  generate: (ctx) => {
    const env = ctx.hosting.urlEnv;
    return {
      prunesComposeService: [ctx.composeService],
      // COMMENTED placeholder only — the operator sets the real value in .env (never committed).
      env: env ? { [env]: `# ${env}=   # your managed ${ctx.engineName} URL (do not commit the real value)` } : undefined,
      reach: `provision a hosted ${ctx.engineName}; set \`${env ?? "its URL"}\` in \`.env\`. Pruned from docker-compose.`,
    };
  },
};
