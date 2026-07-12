/**
 * The COMPLETE model document — the single source of truth for a business, holding every authored layer
 * so the whole thing round-trips and is versionable (commit the model.json to git; import it to recall
 * and iterate before generating). Absent execution-layer decisions are materialized from the deterministic
 * mock defaults on export, so the exported model is explicit and complete — nothing hidden behind a mock.
 */

import type { CapabilityDoc, DomainDoc, ContextsDoc, RolesDoc, WorkflowsDoc, AgentsDoc } from "@vbd/compiler";
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
} from "@vbd/codegen";
import type { Project } from "./projects";

export interface ModelDoc {
  version: string;
  name: string;
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
}

/** The already-resolved core docs from the app (active.X ?? live mock). */
export interface ResolvedCore {
  name: string;
  narrative: string;
  capabilities: CapabilityDoc;
  contexts: ContextsDoc;
  domain: DomainDoc;
  roles: RolesDoc;
  workflows: WorkflowsDoc;
  agents: AgentsDoc;
}

/** Materialize the complete model: the resolved core + every execution layer (authored, else its default). */
export function assembleModel(core: ResolvedCore, p: Project): ModelDoc {
  const { capabilities, domain, contexts, roles, workflows, agents } = core;
  return {
    version: "1.0",
    name: core.name,
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
    binding: p.binding ?? DEFAULT_BINDING,
    theme: p.theme ?? DEFAULT_THEME,
    i18n: p.i18n ?? { sourceLang: "en" },
  };
}

/** Parse an imported model.json into project fields (every layer becomes authored / source of truth). */
export function parseModel(json: unknown): Partial<Project> {
  const m = (json ?? {}) as Partial<ModelDoc>;
  return {
    name: typeof m.name === "string" ? m.name : "Imported model",
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
  };
}
