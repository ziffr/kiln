/**
 * The COMPLETE model document — the single source of truth for a business, holding every authored layer
 * so the whole thing round-trips and is versionable (commit the model.json to git; import it to recall
 * and iterate before generating). Absent execution-layer decisions are materialized from the deterministic
 * mock defaults on export, so the exported model is explicit and complete — nothing hidden behind a mock.
 */

import type { CapabilityDoc, DomainDoc, ContextsDoc, RolesDoc, WorkflowsDoc, AgentsDoc } from "@kiln/compiler";
import {
  mockCommunications,
  mockIntegrations,
  mockExternalServices,
  mockTriggers,
  DEFAULT_BINDING,
  DEFAULT_THEME,
  type CommunicationsDoc,
  type IntegrationsDoc,
  type ExternalServicesDoc,
  type TriggersDoc,
  type Binding,
  type Theme,
} from "@kiln/codegen";
import type { Project, Observability } from "./projects";

export interface ModelDoc {
  version: string;
  name: string;
  description?: string;
  narrative: string;
  capabilities: CapabilityDoc;
  contexts: ContextsDoc;
  domain: DomainDoc;
  roles: RolesDoc;
  workflows: WorkflowsDoc;
  agents: AgentsDoc;
  services: ExternalServicesDoc;
  triggers: TriggersDoc;
  comms: CommunicationsDoc;
  integrations: IntegrationsDoc;
  binding: Binding;
  theme: Theme;
  i18n: { sourceLang: string; translations?: Record<string, Record<string, string>> };
  /** Prompt & Output studio sidecar (Part 3): the last generation + review output per stage. An OPTIONAL
   *  inspection artifact — NOT authored/derived IR (golden invariant #1). Round-trips with the model so a
   *  user can recall it, but the codegen exporter simply ignores it (it reads only the modelling layers). */
  observability?: Observability;
}

/** The already-resolved core docs from the app (active.X ?? live mock). */
export interface ResolvedCore {
  name: string;
  description?: string;
  narrative: string;
  capabilities: CapabilityDoc;
  contexts: ContextsDoc;
  domain: DomainDoc;
  roles: RolesDoc;
  workflows: WorkflowsDoc;
  agents: AgentsDoc;
}

/** Materialize the complete model: the resolved core + every execution layer (authored, else its default). */
export function assembleModel(core: ResolvedCore, p: Project, agent?: { provider?: string; model?: string; baseUrl?: string }): ModelDoc {
  const { capabilities, domain, contexts, roles, workflows, agents } = core;
  const baseBinding = p.binding ?? DEFAULT_BINDING;
  // Bake the agent-runtime engine default (the engine the model was built on) into the binding so the
  // exported app's .env.example leads with it. Absent → Anthropic-first, as before.
  const binding = agent ? { ...baseBinding, agent } : baseBinding;
  return {
    version: "1.0",
    name: core.name,
    description: p.description ?? undefined,
    narrative: core.narrative,
    capabilities,
    contexts,
    domain,
    roles,
    workflows,
    agents,
    services: p.services ?? mockExternalServices(capabilities, domain, workflows, agents),
    triggers: p.triggers ?? mockTriggers(capabilities, domain, workflows, agents),
    comms: p.comms ?? mockCommunications(capabilities, domain),
    integrations: p.integrations ?? mockIntegrations(capabilities, domain),
    binding,
    theme: p.theme ?? DEFAULT_THEME,
    i18n: p.i18n ?? { sourceLang: "en" },
    // Sidecar — only present when the user has actually run a stage (kept out of the model when empty).
    ...(p.observability && Object.keys(p.observability).length ? { observability: p.observability } : {}),
  };
}

/** Parse an imported model.json into project fields (every layer becomes authored / source of truth). */
export function parseModel(json: unknown): Partial<Project> {
  const m = (json ?? {}) as Partial<ModelDoc>;
  return {
    name: typeof m.name === "string" ? m.name : "Imported model",
    description: typeof m.description === "string" ? m.description : undefined,
    narrative: typeof m.narrative === "string" ? m.narrative : "",
    capabilities: m.capabilities ?? null,
    contexts: m.contexts ?? null,
    domain: m.domain ?? null,
    roles: m.roles ?? null,
    workflows: m.workflows ?? null,
    agents: m.agents ?? null,
    services: m.services ?? null,
    triggers: m.triggers ?? null,
    comms: m.comms ?? null,
    integrations: m.integrations ?? null,
    binding: m.binding ?? null,
    theme: m.theme ?? null,
    i18n: m.i18n ?? null,
    observability: m.observability ?? null,
  };
}
