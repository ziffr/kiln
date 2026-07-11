import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  parseNarrative,
  validateNarrative,
  businessOutcomes,
  coreActivities,
  customers,
} from "@vbd/narrative";
import {
  compileCapabilities,
  contextNodeId,
  type AggregateInput,
  type CapabilityDoc,
  type CapabilityInput,
  type ContextInput,
  type ContextsDoc,
  type DomainDoc,
  type RolesDoc,
  type WorkflowsDoc,
  type AgentsDoc,
} from "@vbd/compiler";
import { validateAll, validateDomain, validateContexts, validateEvents, validatePolicies, validateRoles, validateWorkflows, validateAgents } from "@vbd/validation";
import { mockGenerateCapabilities, mockGenerateDomain, mockGroupContexts, mockGenerateEvents, mockGeneratePolicies, mockGenerateRoles, mockGenerateWorkflows, mockGenerateAgents, critiqueToFeedback, resolveTarget, CRITIQUE_EFFORT, LAYER_TIER, type LayerKind, type CritiqueFinding } from "@vbd/skills";
import { SettingsModal } from "./components/SettingsModal";
import { CapabilityMap } from "./components/CapabilityMap";
import { NodeDetail } from "./components/NodeDetail";
import { AreaDetail } from "./components/AreaDetail";
import { CodePreview } from "./components/CodePreview";
import { ReviewPanel } from "./components/ReviewPanel";
import { Guide } from "./components/Guide";
import { NarrativeInput } from "./components/NarrativeInput";
import {
  loadProjects,
  saveProjects,
  newProject,
  type Project,
  type ProjectState,
} from "./projects";
import { serverListProjects, serverSaveProject, serverDeleteProject } from "./projectStore";
import { SERVICE_URL } from "./config";



const MODELS = [
  { id: "claude-sonnet-5", label: "Sonnet 5", supportsEffort: true, inPerM: 2, outPerM: 10 },
  { id: "claude-opus-4-8", label: "Opus 4.8", supportsEffort: true, inPerM: 5, outPerM: 25 },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", supportsEffort: false, inPerM: 1, outPerM: 5 },
];
// Rough tokens per model call (input/output), used only for the Auto cost estimate. Deliberately a
// ballpark — the confirm shows a ±range, and the real per-call spend is reported after each call.
const EST_IN_TOKENS = 2000;
const EST_OUT_TOKENS = 800;
const EFFORTS = ["low", "medium", "high", "max"];
// Default per-tier models when "pick model per step" is on: upgrade the hard-reasoning stages to
// Opus, keep the rest on Sonnet (quality-first; the user can drop light stages to Haiku for cost).
const DEFAULT_TIER_MODELS = { light: "claude-sonnet-5", standard: "claude-sonnet-5", heavy: "claude-opus-4-8" };

function FindingsBadge({ count }: { count: number }): React.JSX.Element {
  const { t } = useTranslation();
  const ok = count === 0;
  return <span className={`badge ${ok ? "ok" : "warn"}`}>{ok ? t("clean") : t("findingsCount", { count })}</span>;
}

// A partial model override — lets the auto-review loop feed just-refined docs into the next
// Review/Refine without waiting for React's async state to flush (which would leave them stale).
interface ModelOverride {
  contexts?: ContextsDoc;
  domain?: DomainDoc;
  roles?: RolesDoc;
  workflows?: WorkflowsDoc;
  agents?: AgentsDoc;
}

export default function App(): React.JSX.Element {
  const { t, i18n } = useTranslation();

  // ---- Projects: server-backed when reachable, localStorage cache/fallback (ADR-006) ----
  const [state, setState] = useState<ProjectState>(() => loadProjects()); // instant local render
  const [serverUp, setServerUp] = useState(false);
  useEffect(() => saveProjects(state), [state]); // always mirror to localStorage (+ activeId pref)
  const active = state.projects.find((p) => p.id === state.activeId) ?? state.projects[0];

  // On load: adopt the server's projects; if the server is empty, migrate local projects up once.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const server = await serverListProjects();
      if (cancelled || server === null) return; // offline → stay on localStorage
      setServerUp(true);
      if (server.length === 0) {
        for (const p of stateRef.current.projects) await serverSaveProject(p); // one-time import
      } else {
        setState((s) => ({
          projects: server,
          activeId: server.some((p) => p.id === s.activeId) ? s.activeId : server[0].id,
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist the active project to the server (debounced) whenever it changes.
  useEffect(() => {
    if (!serverUp || !active) return;
    const timer = setTimeout(() => void serverSaveProject(active), 700);
    return () => clearTimeout(timer);
  }, [active, serverUp]);

  const patchActive = (patch: Partial<Project>): void =>
    setState((s) => ({
      ...s,
      projects: s.projects.map((p) => (p.id === s.activeId ? { ...p, ...patch, updatedAt: Date.now() } : p)),
    }));

  // ---- Transient UI state ----
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [spend, setSpend] = useState<{
    estCostUsd: number;
    sessionSpendUsd: number;
    usage: { input: number; output: number };
  } | null>(null);

  const text = active.narrative;
  const doc = useMemo(() => parseNarrative(text), [text]);
  const narrativeFindings = useMemo(() => validateNarrative(doc), [doc]);

  const mockDoc = useMemo(() => mockGenerateCapabilities(doc), [doc]);
  const activeDoc = active.capabilities ?? mockDoc;
  const capFindings = useMemo(() => validateAll(activeDoc), [activeDoc]);
  // SPEC-002: the domain model — LLM-generated when present (DM2), else the live mock (DM1).
  const mockDomain = useMemo(() => mockGenerateDomain(activeDoc), [activeDoc]);
  const domainDoc = active.domain ?? mockDomain;
  // SPEC-003: the business-areas partition — LLM (BC-M3) when present, else the live mock (BC-M1).
  const mockContexts = useMemo(() => mockGroupContexts(activeDoc), [activeDoc]);
  const contextsDoc = active.contexts ?? mockContexts;
  const contextFindings = useMemo(() => validateContexts(contextsDoc, activeDoc), [contextsDoc, activeDoc]);
  const [contextsBusy, setContextsBusy] = useState(false);
  // Semantic critic (AI review across every layer). critique[layer] === undefined → not reviewed;
  // [] → reviewed-clean (closure); >0 → advisory findings. A capability change shifts every derived
  // layer, so all critique goes stale → clear it.
  const [critique, setCritique] = useState<Partial<Record<LayerKind, CritiqueFinding[]>>>({});
  const [reviewBusy, setReviewBusy] = useState<LayerKind | null>(null);
  const capSig = activeDoc.capabilities.map((c) => c.id).join(",");
  useEffect(() => setCritique({}), [capSig]);
  // Auto mode: run the whole Review→Refine→Re-review loop to closure, layer by layer.
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoLayer, setAutoLayer] = useState<LayerKind | null>(null);
  const autoStopRef = useRef(false);
  // SPEC-004 behaviour: commands/events live on the domain doc — LLM when present, else live mock.
  const behaviourDoc = useMemo(
    () => (((domainDoc.commands?.length ?? 0) + (domainDoc.events?.length ?? 0)) > 0 ? domainDoc : mockGenerateEvents(domainDoc)),
    [domainDoc],
  );
  const eventFindings = useMemo(
    () => validateEvents(behaviourDoc, activeDoc.capabilities.map((c) => c.id)),
    [behaviourDoc, activeDoc],
  );
  const [behaviourBusy, setBehaviourBusy] = useState(false);
  // SPEC-005: reactions (policies) live on the domain doc — LLM when present, else live mock.
  const flowDoc = useMemo(
    () => ((behaviourDoc.policies?.length ?? 0) > 0 ? behaviourDoc : mockGeneratePolicies(behaviourDoc)),
    [behaviourDoc],
  );
  const policyFindings = useMemo(
    () => validatePolicies(flowDoc, activeDoc.capabilities.map((c) => c.id)),
    [flowDoc, activeDoc],
  );
  const [policiesBusy, setPoliciesBusy] = useState(false);
  // SPEC-006: roles/permissions — LLM when present, else the live mock (one Operator over all caps).
  const mockRoles = useMemo(() => mockGenerateRoles(activeDoc), [activeDoc]);
  const rolesDoc = active.roles ?? mockRoles;
  const roleFindings = useMemo(() => validateRoles(rolesDoc, activeDoc.capabilities.map((c) => c.id)), [rolesDoc, activeDoc]);
  const [rolesBusy, setRolesBusy] = useState(false);
  // SPEC-007 workflows + SPEC-008 agents — LLM when present, else the live mock.
  const mockWorkflowsDoc = useMemo(() => mockGenerateWorkflows(behaviourDoc), [behaviourDoc]);
  const workflowsDoc = active.workflows ?? mockWorkflowsDoc;
  const workflowFindings = useMemo(() => validateWorkflows(workflowsDoc, (behaviourDoc.commands ?? []).map((c) => c.id)), [workflowsDoc, behaviourDoc]);
  const [workflowsBusy, setWorkflowsBusy] = useState(false);
  const mockAgentsDoc = useMemo(() => mockGenerateAgents(activeDoc), [activeDoc]);
  const agentsDoc = active.agents ?? mockAgentsDoc;
  const agentFindings = useMemo(() => validateAgents(agentsDoc, activeDoc.capabilities.map((c) => c.id)), [agentsDoc, activeDoc]);
  const [agentsBusy, setAgentsBusy] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // The map IR carries every layer: domain + contexts + behaviour/policies + roles + workflows + agents.
  const ir = useMemo(
    () => compileCapabilities(activeDoc, flowDoc, contextsDoc, rolesDoc, workflowsDoc, agentsDoc),
    [activeDoc, flowDoc, contextsDoc, rolesDoc, workflowsDoc, agentsDoc],
  );
  // Which roles authorize a given capability (for the in-context display).
  const rolesForCap = (capId: string): string[] => rolesDoc.roles.filter((r) => (r.capabilities ?? []).includes(capId)).map((r) => r.name || r.id);

  // Colour each capability by its area for the map backdrop + legend (REV-016 F1: one surface).
  const AREA_COLORS = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#fb923c", "#22d3ee", "#f87171"];
  const areaOf = useMemo(() => {
    const m = new Map<string, { id: string; name: string; color: string }>();
    contextsDoc.contexts.forEach((c, i) => {
      const color = AREA_COLORS[i % AREA_COLORS.length];
      for (const cap of [...(c.capabilities ?? []), ...(c.shared_kernel ?? [])]) {
        if (!m.has(cap)) m.set(cap, { id: c.id, name: c.name, color });
      }
    });
    return m;
  }, [contextsDoc]);
  // SPEC-002 DM validators are the authority — run them client-side (isomorphic) over the active
  // domain so findings surface in the UI, not only inside the /api/domain response.
  const domainFindings = useMemo(
    () => validateDomain(domainDoc, activeDoc.capabilities.map((c) => c.id)),
    [domainDoc, activeDoc],
  );
  const [domainBusy, setDomainBusy] = useState(false);

  // The selected area (when a legend chip / bctx: node is selected) and its derived term list
  // (Q3: read-only ubiquitous language from the members' produced/consumed entity names).
  const selectedArea = contextsDoc.contexts.find((c) => contextNodeId(c.id) === selected);
  const areaTerms = (area: ContextInput): string[] => {
    const terms = new Set<string>();
    for (const m of [...(area.capabilities ?? []), ...(area.shared_kernel ?? [])]) {
      const cap = activeDoc.capabilities.find((c) => c.id === m);
      for (const e of [...(cap?.produces ?? []), ...(cap?.consumes ?? [])]) terms.add(e);
    }
    return [...terms];
  };

  // Resolve a domain finding to the capability whose detail panel shows the offending entity,
  // so clicking a finding opens the right place (subject is a capability id or an aggregate id).
  const findingCapability = (subjects: string[]): string | undefined => {
    for (const s of subjects) {
      if (activeDoc.capabilities.some((c) => c.id === s)) return s;
      const agg = domainDoc.aggregates.find((a) => a.id === s);
      if (agg?.owner && activeDoc.capabilities.some((c) => c.id === agg.owner)) return agg.owner;
    }
    return undefined;
  };

  function setNarrative(v: string): void {
    // Editing invalidates prior LLM snapshots (capabilities/domain/areas/roles) → fall back to mock.
    patchActive({ narrative: v, capabilities: null, provider: null, domain: null, contexts: null, roles: null, workflows: null, agents: null });
    setSelected(null);
  }

  async function generate(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${SERVICE_URL}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ narrative: text, model: modelFor("capabilities"), effort: active.effort }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      // A fresh capability set invalidates prior domain/areas/roles snapshots → back to the live mock.
      patchActive({ capabilities: data.doc as CapabilityDoc, provider: data.provider as string, domain: null, contexts: null, roles: null, workflows: null, agents: null });
      setSpend({ estCostUsd: data.estCostUsd, sessionSpendUsd: data.sessionSpendUsd, usage: data.usage });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // SPEC-002 DM2: generate the domain model (entities per capability) with the real LLM, server-side.
  async function generateDomainModel(): Promise<void> {
    setDomainBusy(true);
    setError(null);
    try {
      const res = await fetch(`${SERVICE_URL}/api/domain`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ capabilities: activeDoc, model: modelFor("entities"), effort: active.effort }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      patchActive({ domain: data.doc });
      setSpend({ estCostUsd: data.estCostUsd, sessionSpendUsd: data.sessionSpendUsd, usage: data.usage });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDomainBusy(false);
    }
  }

  // ---- Capability editing (structured forms, REV-004 F1) ----
  // Reconcile (not blanket-clear) an authored domain when a capability is deleted (REV-020 M1 /
  // REV-025 M1): drop entities the deleted capability owned, plus the commands/events on them; keep
  // everything else the human authored. A null domain stays null (the live mock re-derives).
  function reconcileDomain(id: string): DomainDoc | null | undefined {
    if (!active.domain) return active.domain; // null/undefined → mock re-derives, nothing to preserve
    const keptAggs = active.domain.aggregates.filter((a) => a.owner !== id);
    const keptIds = new Set(keptAggs.map((a) => a.id));
    const commands = (active.domain.commands ?? []).filter((c) => keptIds.has(c.aggregate) && c.capability !== id);
    const events = (active.domain.events ?? []).filter((e) => keptIds.has(e.aggregate));
    const cmdIds = new Set(commands.map((c) => c.id));
    const evtIds = new Set(events.map((e) => e.id));
    return {
      ...active.domain,
      aggregates: keptAggs.map((a) => ({ ...a, references: (a.references ?? []).filter((r) => keptIds.has(r)) })),
      commands,
      events,
      // drop reactions whose trigger event or reaction command no longer exists
      policies: (active.domain.policies ?? []).filter((p) => evtIds.has(p.on) && cmdIds.has(p.then)),
    };
  }

  function editCapability(updated: CapabilityInput): void {
    const base = active.capabilities ?? mockDoc;
    const caps = base.capabilities.map((c) => (c.id === updated.id ? updated : c));
    // Ids are stable, so authored entities/behaviour are unaffected — do NOT clear the domain.
    patchActive({ capabilities: { ...base, capabilities: caps }, provider: "hand-edited" });
  }
  function deleteCapability(id: string): void {
    const base = active.capabilities ?? mockDoc;
    // Reconcile the authored areas partition (drop the deleted member) and the domain (drop its
    // entities/behaviour) — never blanket-clear.
    const reconciledContexts = active.contexts
      ? {
          ...active.contexts,
          contexts: active.contexts.contexts.map((c) => ({
            ...c,
            capabilities: (c.capabilities ?? []).filter((m) => m !== id),
            shared_kernel: (c.shared_kernel ?? []).filter((m) => m !== id),
          })),
        }
      : active.contexts;
    const reconciledRoles = active.roles
      ? { ...active.roles, roles: active.roles.roles.map((r) => ({ ...r, capabilities: (r.capabilities ?? []).filter((c) => c !== id) })) }
      : active.roles;
    patchActive({
      capabilities: { ...base, capabilities: base.capabilities.filter((c) => c.id !== id) },
      provider: "hand-edited",
      domain: reconcileDomain(id),
      contexts: reconciledContexts,
      roles: reconciledRoles,
    });
    setSelected(null);
  }
  function addCapability(): void {
    const base = active.capabilities ?? mockDoc;
    let n = base.capabilities.length + 1;
    let id = `capability_${n}`;
    while (base.capabilities.some((c) => c.id === id)) id = `capability_${++n}`;
    const cap: CapabilityInput = { id, name: "New Capability", purpose: "", outcomes: [] };
    // A new capability owns nothing yet — preserve the authored domain (don't clear).
    patchActive({ capabilities: { ...base, capabilities: [...base.capabilities, cap] }, provider: "hand-edited" });
    setSelected(id);
  }

  // ---- Entity (aggregate) editing (SPEC-002 DM: the model proposes, the human decides) ----
  // Editing materializes the live domain (mock or LLM) into the project, then patches it. Any
  // hand-edit flips the aggregate's origin to "authored" (golden invariant #2) while keeping its
  // derivedFrom trail.
  function editAggregate(updated: AggregateInput): void {
    const base = active.domain ?? mockDomain;
    const authored = { ...updated, meta: { ...(updated.meta ?? {}), origin: "authored" } };
    patchActive({ domain: { ...base, aggregates: base.aggregates.map((a) => (a.id === updated.id ? authored : a)) } });
  }
  function deleteAggregate(id: string): void {
    const base = active.domain ?? mockDomain;
    patchActive({
      domain: {
        ...base,
        aggregates: base.aggregates
          .filter((a) => a.id !== id)
          .map((a) => ({ ...a, references: (a.references ?? []).filter((r) => r !== id) })),
      },
    });
  }
  function addAggregate(ownerId: string): void {
    const base = active.domain ?? mockDomain;
    let n = base.aggregates.length + 1;
    let id = `entity_${n}`;
    while (base.aggregates.some((a) => a.id === id)) id = `entity_${++n}`;
    const agg: AggregateInput = { id, name: "New Entity", owner: ownerId, attributes: [], references: [], meta: { origin: "authored" } };
    patchActive({ domain: { ...base, aggregates: [...base.aggregates, agg] } });
  }

  // ---- Business-areas: generate + editing (SPEC-003; the model proposes, the human decides) ----
  async function generateAreas(): Promise<void> {
    setContextsBusy(true);
    setError(null);
    try {
      const res = await fetch(`${SERVICE_URL}/api/contexts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ capabilities: activeDoc, model: modelFor("areas"), effort: active.effort }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      patchActive({ contexts: data.doc as ContextsDoc });
      setSpend({ estCostUsd: data.estCostUsd, sessionSpendUsd: data.sessionSpendUsd, usage: data.usage });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setContextsBusy(false);
    }
  }

  // SPEC-004: model behaviour (commands/events) on the entities via the real LLM (per-aggregate).
  async function generateBehaviour(): Promise<void> {
    setBehaviourBusy(true);
    setError(null);
    try {
      const res = await fetch(`${SERVICE_URL}/api/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: domainDoc, capabilities: activeDoc, model: modelFor("behaviour"), effort: active.effort }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      // Fresh commands/events invalidate any prior reactions (they referenced old ids) → drop them.
      patchActive({ domain: { ...data.doc, policies: undefined } });
      setSpend({ estCostUsd: data.estCostUsd, sessionSpendUsd: data.sessionSpendUsd, usage: data.usage });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBehaviourBusy(false);
    }
  }

  // SPEC-005: model reactions (policies) wiring events → downstream commands via the real LLM.
  async function generatePoliciesModel(): Promise<void> {
    setPoliciesBusy(true);
    setError(null);
    try {
      const res = await fetch(`${SERVICE_URL}/api/policies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: behaviourDoc, capabilities: activeDoc, model: modelFor("automations"), effort: active.effort }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      patchActive({ domain: data.doc }); // merges policies onto the behaviour doc
      setSpend({ estCostUsd: data.estCostUsd, sessionSpendUsd: data.sessionSpendUsd, usage: data.usage });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPoliciesBusy(false);
    }
  }

  // SPEC-006: model the roles/personas that operate the capabilities via the real LLM.
  async function generateRolesModel(): Promise<void> {
    setRolesBusy(true);
    setError(null);
    try {
      const res = await fetch(`${SERVICE_URL}/api/roles`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ capabilities: activeDoc, model: modelFor("roles"), effort: active.effort }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      patchActive({ roles: data.doc });
      setSpend({ estCostUsd: data.estCostUsd, sessionSpendUsd: data.sessionSpendUsd, usage: data.usage });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRolesBusy(false);
    }
  }

  // ---- Semantic critic: the Review → Refine → Re-review → Clean loop, any layer (advisory) ----
  // A model override lets the auto loop feed a just-refined doc straight into the next review,
  // bypassing React's async state (the render-time docs would otherwise be stale mid-loop).
  // The effort a given review step runs at: the app's per-layer preset when adaptive is on
  // (the user can override individual layers), otherwise the one global effort.
  const critiqueEffortFor = (layer: LayerKind): string =>
    active.adaptiveEffort === false ? active.effort : active.effortByLayer?.[layer] ?? CRITIQUE_EFFORT[layer] ?? "high";

  // The model a given stage runs at: when "pick model per step" is on, by difficulty tier; else the
  // one global model. Applies to a stage's generation AND its review.
  const tierModels = active.tierModels ?? DEFAULT_TIER_MODELS;
  const modelFor = (layer: LayerKind): string =>
    active.adaptiveModel ? tierModels[LAYER_TIER[layer]] ?? active.model : active.model;
  const supportsEffortFor = (layer: LayerKind): boolean => MODELS.find((m) => m.id === modelFor(layer))?.supportsEffort ?? true;

  const reviewBody = (layer: LayerKind, ov: ModelOverride) => ({
    layer,
    capabilities: activeDoc,
    domain: ov.domain ?? flowDoc,
    contexts: ov.contexts ?? contextsDoc,
    roles: ov.roles ?? rolesDoc,
    workflows: ov.workflows ?? workflowsDoc,
    agents: ov.agents ?? agentsDoc,
    model: modelFor(layer),
    effort: critiqueEffortFor(layer),
  });

  // Review: ask the LLM (higher effort, server-side) to critique one layer. Returns the findings.
  async function reviewLayer(layer: LayerKind, ov: ModelOverride = {}): Promise<CritiqueFinding[]> {
    setReviewBusy(layer);
    setError(null);
    try {
      const res = await fetch(`${SERVICE_URL}/api/critique`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reviewBody(layer, ov)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const findings = (data.findings ?? []) as CritiqueFinding[];
      setCritique((prev) => ({ ...prev, [layer]: findings }));
      setSpend({ estCostUsd: data.estCostUsd, sessionSpendUsd: data.sessionSpendUsd, usage: data.usage });
      return findings;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return [];
    } finally {
      setReviewBusy(null);
    }
  }

  // Refine: re-generate the layer feeding its own critique back in as guidance. Returns the override
  // for the freshly-refined doc (so the caller can re-review against it) or null. `ov.domain` lets a
  // downstream refine consume upstream layers refined earlier in the same auto run.
  async function refineLayer(layer: LayerKind, findings?: CritiqueFinding[], ov: ModelOverride = {}): Promise<ModelOverride | null> {
    const fs = findings ?? critique[layer];
    if (!fs || fs.length === 0) return null;
    const common = { model: modelFor(layer), effort: active.effort, feedback: critiqueToFeedback(fs) };
    let url = "";
    let body: Record<string, unknown> = {};
    let applyDoc: (doc: unknown) => ModelOverride = () => ({});
    switch (layer) {
      case "areas": url = "/api/contexts"; body = { capabilities: activeDoc, ...common }; applyDoc = (d) => { patchActive({ contexts: d as ContextsDoc }); return { contexts: d as ContextsDoc }; }; break;
      case "entities": url = "/api/domain"; body = { capabilities: activeDoc, ...common }; applyDoc = (d) => { patchActive({ domain: d as DomainDoc }); return { domain: d as DomainDoc }; }; break;
      case "behaviour": url = "/api/events"; body = { domain: ov.domain ?? domainDoc, capabilities: activeDoc, ...common }; applyDoc = (d) => { const dd = { ...(d as DomainDoc), policies: undefined }; patchActive({ domain: dd }); return { domain: dd }; }; break;
      case "automations": url = "/api/policies"; body = { domain: ov.domain ?? behaviourDoc, capabilities: activeDoc, ...common }; applyDoc = (d) => { patchActive({ domain: d as DomainDoc }); return { domain: d as DomainDoc }; }; break;
      case "roles": url = "/api/roles"; body = { capabilities: activeDoc, ...common }; applyDoc = (d) => { patchActive({ roles: d as RolesDoc }); return { roles: d as RolesDoc }; }; break;
      case "workflows": url = "/api/workflows"; body = { domain: ov.domain ?? behaviourDoc, ...common }; applyDoc = (d) => { patchActive({ workflows: d as WorkflowsDoc }); return { workflows: d as WorkflowsDoc }; }; break;
      case "agents": url = "/api/agents"; body = { capabilities: activeDoc, ...common }; applyDoc = (d) => { patchActive({ agents: d as AgentsDoc }); return { agents: d as AgentsDoc }; }; break;
      default: return null; // capabilities: review-only (regenerating from the narrative would reset downstream)
    }
    setReviewBusy(layer);
    setError(null);
    try {
      const res = await fetch(`${SERVICE_URL}${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const override = applyDoc(data.doc);
      setCritique((prev) => ({ ...prev, [layer]: undefined })); // refined → re-review to confirm closure
      setSpend({ estCostUsd: data.estCostUsd, sessionSpendUsd: data.sessionSpendUsd, usage: data.usage });
      return override;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setReviewBusy(null);
    }
  }

  // Auto mode: drive every layer to closure on its own. For each layer, Review → while there are
  // "concern"-level findings (bounded by MAX_REFINES), Refine and re-review; stop early when only
  // subjective suggestions remain. Cooperative-cancellable via the Stop button. Threads an
  // accumulating override so each re-review (and downstream refine) sees the freshly-refined docs.
  async function autoReview(): Promise<void> {
    if (autoRunning) return;
    const MAX_REFINES = 2;
    // Estimate the worst case up front and get explicit consent — a full run is a burst of
    // higher-effort calls. Tier-aware: each stage is priced at the model it actually runs on
    // (Opus stages cost more than Sonnet/Haiku ones). Per layer: 1 review + up to 2 refine+re-review.
    const perCall = (modelId: string): number => {
      const m = MODELS.find((x) => x.id === modelId);
      return (EST_IN_TOKENS * (m?.inPerM ?? 2) + EST_OUT_TOKENS * (m?.outPerM ?? 10)) / 1_000_000;
    };
    let maxCalls = 0;
    let midCost = 0;
    for (const row of reviewLayers) {
      const refinable = row.kind !== "capabilities" && row.kind !== "holistic";
      const n = 1 + (refinable ? MAX_REFINES * 2 : 0); // worst case: initial review + (refine + re-review) × 2
      maxCalls += n;
      midCost += n * perCall(modelFor(row.kind));
    }
    const lo = (midCost * 0.5).toFixed(2);
    const hi = (midCost * 1.5).toFixed(2);
    if (!window.confirm(t("autoConfirm", { calls: maxCalls, lo, hi }))) return;
    setAutoRunning(true);
    autoStopRef.current = false;
    setError(null);
    try {
      let acc: ModelOverride = {};
      for (const row of reviewLayers) {
        if (autoStopRef.current) break;
        const layer = row.kind;
        setAutoLayer(layer);
        let findings = await reviewLayer(layer, acc);
        if (layer === "capabilities" || layer === "holistic") continue; // review-only
        let round = 0;
        while (!autoStopRef.current && round < MAX_REFINES && findings.some((f) => f.severity === "concern")) {
          const refined = await refineLayer(layer, findings, acc);
          if (!refined || autoStopRef.current) break;
          acc = { ...acc, ...refined };
          findings = await reviewLayer(layer, acc);
          round += 1;
        }
      }
    } finally {
      setAutoRunning(false);
      setAutoLayer(null);
    }
  }

  // Click a finding → select the capability / area / entity it is about.
  function selectFinding(f: CritiqueFinding): void {
    const r = resolveTarget(f.target, { caps: activeDoc, contexts: contextsDoc, domain: flowDoc });
    if (!r) return;
    setSelected(r.kind === "area" ? contextNodeId(r.id) : r.id);
  }

  // The layers the Review panel drives (only those with content to review).
  const reviewLayers = ([
    { kind: "capabilities", label: t("capabilities"), count: activeDoc.capabilities.length },
    { kind: "areas", label: t("areas"), count: contextsDoc.contexts.length },
    { kind: "entities", label: t("entities"), count: domainDoc.aggregates.length },
    { kind: "behaviour", label: t("behaviour"), count: (behaviourDoc.commands?.length ?? 0) + (behaviourDoc.events?.length ?? 0) },
    { kind: "automations", label: t("automations"), count: flowDoc.policies?.length ?? 0 },
    { kind: "roles", label: t("roles"), count: rolesDoc.roles.length },
    { kind: "workflows", label: t("workflows"), count: workflowsDoc.workflows.length },
    { kind: "agents", label: t("agents"), count: agentsDoc.agents.length },
  ] as { kind: LayerKind; label: string; count: number }[])
    .filter((r) => r.count > 0 || r.kind === "automations")
    // The cross-layer consistency pass — always available; reasons over the whole model at once.
    .concat([{ kind: "holistic", label: t("holistic"), count: activeDoc.capabilities.length }]);

  // SPEC-007/008: generate workflows (from behaviour) and agents (from capabilities) via the LLM.
  async function generateWorkflowsModel(): Promise<void> {
    setWorkflowsBusy(true); setError(null);
    try {
      const res = await fetch(`${SERVICE_URL}/api/workflows`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain: behaviourDoc, model: modelFor("workflows"), effort: active.effort }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      patchActive({ workflows: data.doc });
      setSpend({ estCostUsd: data.estCostUsd, sessionSpendUsd: data.sessionSpendUsd, usage: data.usage });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setWorkflowsBusy(false); }
  }
  async function generateAgentsModel(): Promise<void> {
    setAgentsBusy(true); setError(null);
    try {
      const res = await fetch(`${SERVICE_URL}/api/agents`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ capabilities: activeDoc, model: modelFor("agents"), effort: active.effort }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      patchActive({ agents: data.doc });
      setSpend({ estCostUsd: data.estCostUsd, sessionSpendUsd: data.sessionSpendUsd, usage: data.usage });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setAgentsBusy(false); }
  }

  // Move a capability to a target area (or "" = unassigned). Single-membership: strip it from every
  // area's `capabilities`/`shared_kernel`, then add to the target. Hand-edit → origin authored.
  function reassignCapabilityArea(capId: string, targetAreaId: string): void {
    const base = active.contexts ?? mockContexts;
    const stripped = base.contexts.map((c) => ({
      ...c,
      capabilities: (c.capabilities ?? []).filter((m) => m !== capId),
      shared_kernel: (c.shared_kernel ?? []).filter((m) => m !== capId),
      meta: { ...(c.meta ?? {}), origin: "authored" },
    }));
    const next = targetAreaId
      ? stripped.map((c) => (c.id === targetAreaId ? { ...c, capabilities: [...c.capabilities, capId] } : c))
      : stripped;
    patchActive({ contexts: { ...base, contexts: next } });
  }
  function editArea(updated: ContextInput): void {
    const base = active.contexts ?? mockContexts;
    const authored = { ...updated, meta: { ...(updated.meta ?? {}), origin: "authored" } };
    patchActive({ contexts: { ...base, contexts: base.contexts.map((c) => (c.id === updated.id ? authored : c)) } });
  }
  function retireArea(id: string): void {
    // Retiring an area leaves its members unassigned → BC2 flags them for the human to reassign.
    const base = active.contexts ?? mockContexts;
    patchActive({ contexts: { ...base, contexts: base.contexts.filter((c) => c.id !== id) } });
    setSelected(null);
  }
  function addArea(): void {
    const base = active.contexts ?? mockContexts;
    let n = base.contexts.length + 1;
    let id = `area_${n}`;
    while (base.contexts.some((c) => c.id === id)) id = `area_${++n}`;
    const area: ContextInput = { id, name: "New Area", intent: "", capabilities: [], shared_kernel: [], meta: { origin: "authored" } };
    patchActive({ contexts: { ...base, contexts: [...base.contexts, area] } });
    setSelected(contextNodeId(id));
  }

  // ---- Project actions ----
  function addProject(): void {
    const name = window.prompt(t("newProjectPrompt"), "");
    if (name === null) return;
    const p = newProject(name);
    setState((s) => ({ projects: [...s.projects, p], activeId: p.id }));
    setSelected(null);
  }
  function renameProject(): void {
    const name = window.prompt(t("renamePrompt"), active.name);
    if (name === null || !name.trim()) return;
    patchActive({ name: name.trim() });
  }
  function deleteProject(): void {
    if (state.projects.length <= 1) return;
    if (!window.confirm(`${t("deleteConfirm")} "${active.name}"`)) return;
    const removedId = active.id;
    setState((s) => {
      const remaining = s.projects.filter((p) => p.id !== s.activeId);
      return { projects: remaining, activeId: remaining[0].id };
    });
    setSelected(null);
    if (serverUp) void serverDeleteProject(removedId);
  }

  const supportsEffort = MODELS.find((m) => m.id === active.model)?.supportsEffort ?? true;

  return (
    <div className="app">
      {showGuide && <Guide onClose={() => setShowGuide(false)} />}
      {showSettings && (
        <SettingsModal
          layers={reviewLayers.map((r) => ({ kind: r.kind, label: r.label }))}
          adaptiveEffort={active.adaptiveEffort !== false}
          effortByLayer={active.effortByLayer ?? {}}
          defaults={CRITIQUE_EFFORT}
          globalEffort={active.effort}
          globalModelLabel={MODELS.find((m) => m.id === active.model)?.label ?? active.model}
          supportsEffort={supportsEffort}
          efforts={EFFORTS}
          models={MODELS}
          adaptiveModel={active.adaptiveModel === true}
          tierModels={tierModels}
          tierOf={LAYER_TIER}
          modelLabelFor={(kind) => MODELS.find((m) => m.id === modelFor(kind))?.label ?? modelFor(kind)}
          onToggleAdaptive={(v) => patchActive({ adaptiveEffort: v })}
          onSetLayerEffort={(kind, effort) => patchActive({ effortByLayer: { ...(active.effortByLayer ?? {}), [kind]: effort } })}
          onToggleAdaptiveModel={(v) => patchActive({ adaptiveModel: v })}
          onSetTierModel={(tier, modelId) => patchActive({ tierModels: { ...tierModels, [tier]: modelId } })}
          onReset={() => patchActive({ adaptiveEffort: true, effortByLayer: {}, adaptiveModel: false, tierModels: DEFAULT_TIER_MODELS })}
          onClose={() => setShowSettings(false)}
          t={t}
        />
      )}
      <header className="topbar">
        <div className="brand">
          <h1>{t("appTitle")}</h1>
          <p className="tagline">{t("tagline")}</p>
        </div>

        <button className="guide-open" onClick={() => setShowGuide(true)}>{t("guideOpen")}</button>
        <button className="guide-open" onClick={() => setShowSettings(true)}>⚙︎ {t("settingsOpen")}</button>

        <div className="projectbar">
          <span className="muted">{t("project")}:</span>
          <select
            value={active.id}
            onChange={(e) => {
              setState((s) => ({ ...s, activeId: e.target.value }));
              setSelected(null);
            }}
          >
            {state.projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button onClick={addProject}>+ {t("newProject")}</button>
          <button onClick={renameProject}>{t("rename")}</button>
          <button onClick={deleteProject} disabled={state.projects.length <= 1}>{t("del")}</button>
        </div>

        <div className="lang">
          <span>{t("language")}:</span>
          {(["de", "en"] as const).map((lng) => (
            <button key={lng} className={i18n.language === lng ? "active" : ""} onClick={() => void i18n.changeLanguage(lng)}>
              {lng.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <main className="cols">
        <section className="col">
          <div className="col-head">
            <h2>{t("narrative")}</h2>
            <FindingsBadge count={narrativeFindings.length} />
          </div>
          <NarrativeInput
            key={active.id}
            narrative={text}
            onNarrative={setNarrative}
            model={active.model}
            effort={active.effort}
            config={active.coachConfig ?? {}}
            onConfig={(c) => patchActive({ coachConfig: c })}
            transcript={active.coachTranscript ?? []}
            onTranscript={(tr) => patchActive({ coachTranscript: tr })}
            lang={i18n.language}
          />
          {narrativeFindings.length > 0 && (
            <ul className="findings">
              {narrativeFindings.map((f) => (
                <li key={f.id}><code>{f.code}</code> {f.message}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="col">
          <div className="col-head">
            <h2>{t("sections")}</h2>
            <span className="muted">{doc.title}</span>
          </div>
          <ul className="sections">
            {doc.sections.map((s) => (
              <li key={s.anchor}>
                <span className="s-head">{s.heading}</span>
                <span className="muted">#{s.anchor} · {s.items.length} {t("items")}</span>
              </li>
            ))}
          </ul>
          <div className="lists">
            <div>
              <h3>{t("outcomes")}</h3>
              <ul>{businessOutcomes(doc).map((o) => <li key={o}>{o}</li>)}</ul>
            </div>
            <div>
              <h3>{t("activities")}</h3>
              <ul>{coreActivities(doc).map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
            <div>
              <h3>{t("customers")}</h3>
              <ul>{customers(doc).map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          </div>
        </section>

        <section className="col grow">
          <div className="col-head">
            <h2>{t("capabilities")}</h2>
            <FindingsBadge count={capFindings.length + domainFindings.length + contextFindings.length + eventFindings.length + policyFindings.length + roleFindings.length + workflowFindings.length + agentFindings.length} />
          </div>

          <div className="genbar">
            <label>
              {t("model")}
              <select value={active.model} onChange={(e) => patchActive({ model: e.target.value })}>
                {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label>
              {t("effort")}
              <select value={active.effort} onChange={(e) => patchActive({ effort: e.target.value })} disabled={!supportsEffort}>
                {EFFORTS.map((ef) => <option key={ef} value={ef}>{ef}</option>)}
              </select>
            </label>
            <button className="generate" onClick={() => void generate()} disabled={busy}>
              {busy ? t("generating") : t("generateBtn")}
            </button>
            <button className="addcap" onClick={addCapability}>{t("addCap")}</button>
            <button className="addcap" onClick={() => void generateDomainModel()} disabled={domainBusy}>
              {domainBusy ? t("generating") : t("genEntities")}
            </button>
            <button className="addcap" onClick={() => void generateAreas()} disabled={contextsBusy}>
              {contextsBusy ? t("generating") : t("genAreas")}
            </button>
            <button className="addcap" onClick={() => void generateBehaviour()} disabled={behaviourBusy}>
              {behaviourBusy ? t("generating") : t("genBehaviour")}
            </button>
            <button className="addcap" onClick={() => void generatePoliciesModel()} disabled={policiesBusy}>
              {policiesBusy ? t("generating") : t("genAutomations")}
            </button>
            <button className="addcap" onClick={() => void generateRolesModel()} disabled={rolesBusy}>
              {rolesBusy ? t("generating") : t("genRoles")}
            </button>
            <button className="addcap" onClick={() => void generateWorkflowsModel()} disabled={workflowsBusy}>
              {workflowsBusy ? t("generating") : t("genWorkflows")}
            </button>
            <button className="addcap" onClick={() => void generateAgentsModel()} disabled={agentsBusy}>
              {agentsBusy ? t("generating") : t("genAgents")}
            </button>
            <button className="viewcode" onClick={() => setShowCode((s) => !s)}>{t("viewCode")}</button>
          </div>

          {/* Business Areas legend — the map backdrop's key; click an area to edit it (REV-016). */}
          {contextsDoc.contexts.length > 0 && (
            <div className="areas-legend">
              <span className="areas-legend-label">{t("areas")}:</span>
              {contextsDoc.contexts.map((c, i) => (
                <button
                  key={c.id}
                  className={`area-chip ${selected === contextNodeId(c.id) ? "sel" : ""}`}
                  style={{ ["--area-color" as string]: AREA_COLORS[i % AREA_COLORS.length] }}
                  onClick={() => setSelected(contextNodeId(c.id))}
                  title={c.intent}
                >
                  <span className="area-dot" />
                  {c.name || c.id} <span className="muted">({(c.capabilities ?? []).length})</span>
                </button>
              ))}
              <button className="area-chip add" onClick={addArea}>{t("addArea")}</button>
            </div>
          )}

          <p className="hint">
            {t("source")}: <strong>{active.provider ?? t("mockLabel")}</strong> · {t("generatedNote")} · {t("ndHint")}
          </p>
          {spend && (
            <p className="spend" title={t("creditNote")}>
              💳 ${spend.estCostUsd.toFixed(4)} {t("thisCall")} · ${spend.sessionSpendUsd.toFixed(4)} {t("thisSession")}
              <span className="muted"> · {spend.usage.input + spend.usage.output} {t("tokens")}</span>
              <br />
              <span className="muted">{t("creditNote")}</span>
            </p>
          )}
          {error && <p className="err-line"><code>{error}</code> — {t("serviceHint")}</p>}

          {capFindings.length > 0 && (
            <ul className="findings cap-findings">
              {capFindings.map((f) => {
                const subj = f.subjects.find((x) => activeDoc.capabilities.some((c) => c.id === x));
                return (
                  <li key={f.id} className={subj ? "clickable" : ""} onClick={() => subj && setSelected(subj)}>
                    <code className={f.severity}>{f.code}</code> {f.message}
                  </li>
                );
              })}
            </ul>
          )}

          {domainFindings.length > 0 && (
            <ul className="findings cap-findings domain-findings">
              <li className="findings-head muted">{t("entities")}</li>
              {domainFindings.map((f) => {
                const subj = findingCapability(f.subjects);
                return (
                  <li key={f.id} className={subj ? "clickable" : ""} onClick={() => subj && setSelected(subj)}>
                    <code className={f.severity}>{f.code}</code> {f.message}
                  </li>
                );
              })}
            </ul>
          )}

          {contextFindings.length > 0 && (
            <ul className="findings cap-findings domain-findings">
              <li className="findings-head muted">{t("areas")}</li>
              {contextFindings.map((f) => {
                // Subject is a capability id or an area id — click through to whichever it names.
                const cap = f.subjects.find((x) => activeDoc.capabilities.some((c) => c.id === x));
                const area = f.subjects.find((x) => contextsDoc.contexts.some((c) => c.id === x));
                const target = cap ?? (area ? contextNodeId(area) : undefined);
                return (
                  <li key={f.id} className={target ? "clickable" : ""} onClick={() => target && setSelected(target)}>
                    <code className={f.severity}>{f.code}</code> {f.message}
                  </li>
                );
              })}
            </ul>
          )}

          {eventFindings.length > 0 && (
            <ul className="findings cap-findings domain-findings">
              <li className="findings-head muted">{t("behaviour")}</li>
              {eventFindings.map((f) => {
                // Resolve to the capability owning the referenced entity, so click opens its panel.
                const aggId = f.subjects.find((x) => behaviourDoc.aggregates.some((a) => a.id === x));
                const owner = aggId ? behaviourDoc.aggregates.find((a) => a.id === aggId)?.owner : undefined;
                const cap = f.subjects.find((x) => activeDoc.capabilities.some((c) => c.id === x)) ?? owner;
                return (
                  <li key={f.id} className={cap ? "clickable" : ""} onClick={() => cap && setSelected(cap)}>
                    <code className={f.severity}>{f.code}</code> {f.message}
                  </li>
                );
              })}
            </ul>
          )}

          {policyFindings.length > 0 && (
            <ul className="findings cap-findings domain-findings">
              <li className="findings-head muted">{t("automations")}</li>
              {policyFindings.map((f) => (
                <li key={f.id}><code className={f.severity}>{f.code}</code> {f.message}</li>
              ))}
            </ul>
          )}

          {roleFindings.length > 0 && (
            <ul className="findings cap-findings domain-findings">
              <li className="findings-head muted">{t("roles")}</li>
              {roleFindings.map((f) => {
                const cap = f.subjects.find((x) => activeDoc.capabilities.some((c) => c.id === x));
                return (
                  <li key={f.id} className={cap ? "clickable" : ""} onClick={() => cap && setSelected(cap)}>
                    <code className={f.severity}>{f.code}</code> {f.message}
                  </li>
                );
              })}
            </ul>
          )}

          {(workflowFindings.length + agentFindings.length) > 0 && (
            <ul className="findings cap-findings domain-findings">
              <li className="findings-head muted">{t("workflows")} · {t("agents")}</li>
              {[...workflowFindings, ...agentFindings].map((f) => (
                <li key={f.id}><code className={f.severity}>{f.code}</code> {f.message}</li>
              ))}
            </ul>
          )}

          <ReviewPanel
            layers={reviewLayers}
            critique={critique}
            busy={reviewBusy}
            refinable={(k) => k !== "capabilities" && k !== "holistic"}
            effortFor={(k) => (supportsEffortFor(k) ? critiqueEffortFor(k) : "—")}
            modelLabelFor={(k) => MODELS.find((m) => m.id === modelFor(k))?.label ?? modelFor(k)}
            showModel={active.adaptiveModel === true}
            onReview={(k) => void reviewLayer(k)}
            onApply={(k, fs) => refineLayer(k, fs).then((r) => r !== null)}
            onSelect={selectFinding}
            onSettings={() => setShowSettings(true)}
            autoRunning={autoRunning}
            autoLayer={autoLayer}
            onAuto={() => void autoReview()}
            onStop={() => { autoStopRef.current = true; }}
            t={t}
          />

          {showCode && (
            <CodePreview
              caps={activeDoc}
              domain={flowDoc}
              contexts={contextsDoc}
              roles={rolesDoc}
              workflows={workflowsDoc}
              agents={agentsDoc}
              requestAppLogic={async (feedback?: string) => {
                const res = await fetch(`${SERVICE_URL}/api/app-logic`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ capabilities: activeDoc, domain: flowDoc, contexts: contextsDoc, feedback, model: modelFor("behaviour"), effort: active.effort }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                setSpend({ estCostUsd: data.estCostUsd, sessionSpendUsd: data.sessionSpendUsd, usage: data.usage });
                return data as { handlers: Record<string, string>; written: number; skipped: number };
              }}
              requestAppComponents={async () => {
                const res = await fetch(`${SERVICE_URL}/api/app-components`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ capabilities: activeDoc, domain: flowDoc, contexts: contextsDoc, model: modelFor("entities"), effort: active.effort }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                setSpend({ estCostUsd: data.estCostUsd, sessionSpendUsd: data.sessionSpendUsd, usage: data.usage });
                return data as { views: Record<string, unknown>; written: number; skipped: number };
              }}
              requestCodeReview={async (handlerCode) => {
                const res = await fetch(`${SERVICE_URL}/api/code-review`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ capabilities: activeDoc, domain: flowDoc, contexts: contextsDoc, roles: rolesDoc, handlerCode, model: modelFor("behaviour") }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                setSpend({ estCostUsd: data.estCostUsd, sessionSpendUsd: data.sessionSpendUsd, usage: data.usage });
                return data.findings ?? [];
              }}
              onClose={() => setShowCode(false)}
            />
          )}

          <div className="map-wrap">
            <CapabilityMap ir={ir} areaOf={areaOf} selectedId={selected} onSelect={setSelected} />
            {selectedArea ? (
              <AreaDetail
                area={selectedArea}
                doc={activeDoc}
                terms={areaTerms(selectedArea)}
                onEdit={editArea}
                onRetire={retireArea}
                onSelectCapability={setSelected}
                onClose={() => setSelected(null)}
              />
            ) : (
              <NodeDetail
                doc={activeDoc}
                aggregates={domainDoc.aggregates}
                commands={behaviourDoc.commands ?? []}
                events={behaviourDoc.events ?? []}
                policies={flowDoc.policies ?? []}
                capRoles={selected ? rolesForCap(selected) : []}
                areas={contextsDoc.contexts.map((c) => ({ id: c.id, name: c.name }))}
                capAreaId={selected ? areaOf.get(selected)?.id : undefined}
                onReassignArea={reassignCapabilityArea}
                selectedId={selected}
                onEdit={editCapability}
                onDelete={deleteCapability}
                onEditAggregate={editAggregate}
                onDeleteAggregate={deleteAggregate}
                onAddAggregate={addAggregate}
                onClose={() => setSelected(null)}
              />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
