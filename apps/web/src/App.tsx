import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  parseNarrative,
  validateNarrative,
  businessOutcomes,
  coreActivities,
  customers,
} from "@kiln/narrative";
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
} from "@kiln/compiler";
import { validateAll, validateDomain, validateContexts, validateEvents, validatePolicies, validateRoles, validateWorkflows, validateAgents } from "@kiln/validation";
import { mockGenerateCapabilities, mockGenerateDomain, mockGroupContexts, mockGenerateEvents, mockGeneratePolicies, mockGenerateRoles, mockGenerateWorkflows, mockGenerateAgents, mockEnrichDomain, applyEnrichment, critiqueToFeedback, resolveTarget, CRITIQUE_EFFORT, LAYER_TIER, type LayerKind, type CritiqueFinding } from "@kiln/skills";
import { flattenEnrichment, rebuildEnrichment, type EnrichProposal } from "./enrichReview";
import { flattenLayerItems, applyLayerItems, groundedLayerItems, type EnrichLayer } from "./layerEnrich";
import { EnrichPanel } from "./components/EnrichPanel";
import { mockExternalServices } from "@kiln/codegen";
import { SettingsModal } from "./components/SettingsModal";
import { CapabilityMap } from "./components/CapabilityMap";
import { StageRail, type StageId, type StageInfo } from "./components/StageRail";
import { BehaviourView, AutomationsView, RolesMatrix, WorkflowsView } from "./components/StageViews";
import { EntityDiagram } from "./components/EntityDiagram";
import { AreaDiagram } from "./components/AreaDiagram";
import { AgentDiagram } from "./components/AgentDiagram";
import { EntityTrace } from "./components/EntityTrace";
import { NodeDetail } from "./components/NodeDetail";
import { AreaDetail } from "./components/AreaDetail";
import { CodePreview } from "./components/CodePreview";
import { InputDialog, ConfirmDialog } from "./components/Modal";
import { STUDIO_TOKEN_KEY } from "./studio-auth";
import { Icon } from "./components/Icon";

type DialogState =
  | { kind: "input"; title: string; label?: string; initial?: string; multiline?: boolean; submitLabel: string; onSubmit: (value: string) => void }
  | { kind: "confirm"; title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void };
import { ReviewPanel } from "./components/ReviewPanel";
import { Guide } from "./components/Guide";
import { ExamplesModal } from "./components/ExamplesModal";
import { NarrativeInput } from "./components/NarrativeInput";
import {
  loadProjects,
  saveProjects,
  newProject,
  type Project,
  type ProjectState,
} from "./projects";
import { serverListProjects, serverSaveProject, serverDeleteProject } from "./projectStore";
import { assembleModel, parseModel } from "./model";
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
  useEffect(() => { // studio lock: studio-auth.ts signals a locked /api; ask for the passphrase in-app
    const onLocked = () => setStudioLocked(true);
    window.addEventListener("kiln:studio-locked", onLocked);
    return () => window.removeEventListener("kiln:studio-locked", onLocked);
  }, []);
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
  // Transient hover target — hovering a finding glows the matching artifact on the canvas.
  const [hovered, setHovered] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [studioLocked, setStudioLocked] = useState(false);
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
  const [orchestrationBusy, setOrchestrationBusy] = useState(false);
  const [orchestrationRationales, setOrchestrationRationales] = useState<Record<string, string>>({});
  const mockAgentsDoc = useMemo(() => mockGenerateAgents(activeDoc), [activeDoc]);
  // external services available to delegate a process to (the "External" routing option's picker).
  const serviceOptions = useMemo(
    () => mockExternalServices(activeDoc, behaviourDoc, workflowsDoc, active.agents ?? mockGenerateAgents(activeDoc)).services.map((s) => ({ id: s.id, name: s.name, invocation: s.invocation })),
    [activeDoc, behaviourDoc, workflowsDoc, active.agents],
  );
  const agentsDoc = active.agents ?? mockAgentsDoc;
  const agentFindings = useMemo(() => validateAgents(agentsDoc, activeDoc.capabilities.map((c) => c.id)), [agentsDoc, activeDoc]);
  const [agentsBusy, setAgentsBusy] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [stage, setStage] = useState<StageId>("capabilities");
  // Navigation history for the breadcrumb: every in-screen jump appends; clicking a crumb (or an artifact
  // already visited) truncates back to it; using the left rail resets the trail to a fresh root.
  const [trail, setTrail] = useState<{ stage: StageId; id: string | null }[]>([{ stage: "capabilities", id: null }]);
  // Central navigation: the ONE way to change stage+selection so the trail stays honest.
  function navTo(nextStage: StageId, id: string | null = null): void {
    setStage(nextStage);
    setSelected(id);
    setTrail((prev) => {
      const i = prev.findIndex((e) => e.stage === nextStage && e.id === id);
      return i >= 0 ? prev.slice(0, i + 1) : [...prev, { stage: nextStage, id }];
    });
  }
  // A top-level jump (left rail / project switch): start a fresh trail rooted at this stage.
  function navRoot(nextStage: StageId): void {
    setStage(nextStage);
    setSelected(null);
    setTrail([{ stage: nextStage, id: null }]);
  }
  // The map IR carries every layer: domain + contexts + behaviour/policies + roles + workflows + agents.
  const ir = useMemo(
    () => compileCapabilities(activeDoc, flowDoc, contextsDoc, rolesDoc, workflowsDoc, agentsDoc),
    [activeDoc, flowDoc, contextsDoc, rolesDoc, workflowsDoc, agentsDoc],
  );
  // Which roles authorize a given capability (for the in-context display).
  const rolesForCap = (capId: string): string[] => rolesDoc.roles.filter((r) => (r.capabilities ?? []).includes(capId)).map((r) => r.name || r.id);

  // Colour each capability by its area for the map backdrop + legend (REV-016 F1: one surface).
  // A muted, earthy categorical palette harmonised with the brand (fired-clay ember + quiet indigo,
  // both echoed below) — mid-tone chroma so each hue stays legible on warm paper AND warm charcoal.
  const AREA_COLORS = ["#c2683c", "#3f8f83", "#b0842f", "#6b62cf", "#7f9350", "#b25d76", "#5f7cae", "#8f6aa8"];
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
  // A selected entity (aggregate id) opens the cross-layer connections trace instead of NodeDetail.
  const selectedAggregate = selected ? domainDoc.aggregates.find((a) => a.id === selected) : undefined;
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

  // The artifact id an AI-review finding points at (area ids become their node id) — shared by
  // click (navigate) and hover (highlight).
  function findingTargetId(f: CritiqueFinding): string | null {
    const r = resolveTarget(f.target, { caps: activeDoc, contexts: contextsDoc, domain: flowDoc });
    return r ? (r.kind === "area" ? contextNodeId(r.id) : r.id) : null;
  }
  // Click a finding → select the capability / area / entity it is about.
  function selectFinding(f: CritiqueFinding): void {
    const id = findingTargetId(f);
    if (id) navTo(stage, id);
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

  // SPEC-009 orchestration review: route a process (source of truth), or ask the LLM to recommend.
  function setWorkflowMode(id: string, mode: "workflow" | "agent" | "external"): void {
    patchActive({ workflows: { ...workflowsDoc, workflows: workflowsDoc.workflows.map((w) => (w.id === id ? { ...w, mode } : w)) } });
  }
  function setWorkflowService(id: string, service: string): void {
    patchActive({ workflows: { ...workflowsDoc, workflows: workflowsDoc.workflows.map((w) => (w.id === id ? { ...w, service } : w)) } });
  }
  // per-step delegation: bind a single step to an external service (serviceId "" = keep it internal).
  function setWorkflowStepBinding(id: string, step: string, serviceId: string): void {
    patchActive({
      workflows: {
        ...workflowsDoc,
        workflows: workflowsDoc.workflows.map((w) => {
          if (w.id !== id) return w;
          const bindings = { ...(w.stepBindings ?? {}) };
          if (serviceId) bindings[step] = serviceId;
          else delete bindings[step];
          return { ...w, stepBindings: bindings };
        }),
      },
    });
  }
  async function classifyOrchestration(): Promise<void> {
    setOrchestrationBusy(true); setError(null);
    try {
      const res = await fetch(`${SERVICE_URL}/api/orchestration`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workflows: workflowsDoc, domain: behaviourDoc, model: modelFor("workflows"), effort: active.effort }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      patchActive({ workflows: data.workflows }); // modes folded onto the workflows (source of truth)
      setOrchestrationRationales(Object.fromEntries((data.doc?.decisions ?? []).map((d: { id: string; rationale: string }) => [d.id, d.rationale])));
      setSpend({ estCostUsd: data.estCostUsd, sessionSpendUsd: data.sessionSpendUsd, usage: data.usage });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setOrchestrationBusy(false); }
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

  // ---- Project actions (via in-app dialogs, not native prompt/confirm) ----
  function addProject(): void {
    setDialog({ kind: "input", title: t("newProject"), label: t("newProjectPrompt"), submitLabel: t("createBtn"), onSubmit: (name) => {
      if (!name.trim()) return;
      const p = newProject(name.trim());
      setState((s) => ({ projects: [...s.projects, p], activeId: p.id }));
      setSelected(null);
    } });
  }
  function pickExample(p: Project): void {
    setState((s) => ({ projects: [...s.projects, p], activeId: p.id }));
    navRoot(stage);
  }
  function renameProject(): void {
    setDialog({ kind: "input", title: t("rename"), label: t("renamePrompt"), initial: active.name, submitLabel: t("save"), onSubmit: (v) => { if (v.trim()) patchActive({ name: v.trim() }); } });
  }
  function editDescription(): void {
    setDialog({ kind: "input", title: t("descriptionHint"), label: t("descriptionPrompt"), initial: active.description ?? "", multiline: true, submitLabel: t("save"), onSubmit: (v) => patchActive({ description: v.trim() || undefined }) });
  }
  function deleteProject(): void {
    if (state.projects.length <= 1) return;
    setDialog({ kind: "confirm", title: t("del"), message: `${t("deleteConfirm")} "${active.name}"`, confirmLabel: t("del"), danger: true, onConfirm: () => {
      const removedId = active.id;
      setState((s) => {
        const remaining = s.projects.filter((p) => p.id !== s.activeId);
        return { projects: remaining, activeId: remaining[0].id };
      });
      setSelected(null);
      if (serverUp) void serverDeleteProject(removedId);
    } });
  }

  // ---- The complete model document (recall + iterate + version) ----
  // Export the WHOLE model (every layer, execution decisions materialized) as one git-versionable
  // model.json; import one back as a new project. This is the single source of truth for the business.
  const modelFileRef = useRef<HTMLInputElement>(null);
  function exportModel(): void {
    const model = assembleModel(
      { name: active.name, description: active.description, narrative: text, capabilities: activeDoc, contexts: contextsDoc, domain: flowDoc, roles: rolesDoc, workflows: workflowsDoc, agents: agentsDoc },
      active,
    );
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(active.name || "model").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.model.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function importModel(file: File): Promise<void> {
    try {
      const fields = parseModel(JSON.parse(await file.text()));
      const p: Project = { ...newProject(fields.name ?? "Imported model"), ...fields };
      setState((s) => ({ projects: [...s.projects, p], activeId: p.id }));
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // ---- Enrichment (accept/decline/adjust): propose what a typical business is missing, per layer ----
  const [enrichProps, setEnrichProps] = useState<EnrichProposal[] | null>(null);
  const [enrichLayer, setEnrichLayer] = useState<"entities" | EnrichLayer>("entities");
  const [enrichWebBusy, setEnrichWebBusy] = useState(false);
  const capNameOf = (id: string): string => activeDoc.capabilities.find((c) => c.id === id)?.name ?? id;
  const validCaps = (): Set<string> => new Set(activeDoc.capabilities.map((c) => c.id));
  const existingIds = (layer: EnrichLayer): Set<string> =>
    new Set(layer === "capabilities" ? activeDoc.capabilities.map((c) => c.id) : layer === "roles" ? rolesDoc.roles.map((r) => r.id) : agentsDoc.agents.map((a) => a.id));
  const mergeProps = (extra: EnrichProposal[]): void =>
    setEnrichProps((ps) => { const have = new Set((ps ?? []).map((p) => p.id)); return [...(ps ?? []), ...extra.filter((p) => !have.has(p.id))]; });

  function runEnrichGrounded(): void {
    setEnrichLayer("entities");
    setEnrichProps(flattenEnrichment(mockEnrichDomain(activeDoc, flowDoc, "standard"), flowDoc, "grounded"));
  }
  function runLayerEnrich(layer: EnrichLayer): void {
    setEnrichLayer(layer);
    setEnrichProps(flattenLayerItems(layer, groundedLayerItems(layer, existingIds(layer)), existingIds(layer), validCaps(), capNameOf, "grounded"));
  }
  function toggleEnrich(id: string): void {
    setEnrichProps((ps) => (ps ? ps.map((p) => (p.id === id ? { ...p, accepted: !p.accepted } : p)) : ps));
  }
  function applyEnrich(): void {
    const accepted = (enrichProps ?? []).filter((p) => p.accepted);
    if (accepted.length) {
      if (enrichLayer === "entities") patchActive({ domain: applyEnrichment(flowDoc, rebuildEnrichment(accepted)) });
      else patchActive(applyLayerItems(enrichLayer, activeDoc, rolesDoc, agentsDoc, accepted));
    }
    setEnrichProps(null);
  }
  // Web/industry research source — proposes cited, missing aspects for the active layer; merged into the review.
  async function enrichWeb(): Promise<void> {
    setEnrichWebBusy(true);
    setError(null);
    try {
      const common = { model: modelFor(enrichLayer === "entities" ? "entities" : "capabilities"), effort: active.effort };
      const url = enrichLayer === "entities" ? "/api/enrich-web" : "/api/enrich-layer";
      const body = enrichLayer === "entities"
        ? { capabilities: activeDoc, domain: flowDoc, ...common }
        : { layer: enrichLayer, capabilities: activeDoc, roles: rolesDoc, agents: agentsDoc, domain: flowDoc, ...common };
      const res = await fetch(`${SERVICE_URL}${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const cite = (data.sources ?? [])[0];
      mergeProps(
        enrichLayer === "entities"
          ? flattenEnrichment(data.enrichment, flowDoc, "web", {}, cite)
          : flattenLayerItems(enrichLayer, data.items ?? [], existingIds(enrichLayer), validCaps(), capNameOf, "web", cite),
      );
      setSpend({ estCostUsd: data.estCostUsd, sessionSpendUsd: data.sessionSpendUsd, usage: data.usage });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnrichWebBusy(false);
    }
  }

  const supportsEffort = MODELS.find((m) => m.id === active.model)?.supportsEffort ?? true;

  // ---- Stage pipeline (progressive disclosure) ----
  const layerStatus = (authored: unknown, live: number): "empty" | "mock" | "ready" => (authored ? "ready" : live > 0 ? "mock" : "empty");
  const stages: StageInfo[] = [
    { id: "narrative", label: t("narrative"), status: text.trim() ? "ready" : "empty", findings: narrativeFindings.length },
    { id: "capabilities", label: t("capabilities"), status: layerStatus(active.capabilities, activeDoc.capabilities.length), findings: capFindings.length },
    { id: "areas", label: t("areas"), status: layerStatus(active.contexts, contextsDoc.contexts.length), findings: contextFindings.length },
    { id: "entities", label: t("entities"), status: layerStatus(active.domain, domainDoc.aggregates.length), findings: domainFindings.length },
    { id: "behaviour", label: t("behaviour"), status: layerStatus(active.domain?.commands?.length, (behaviourDoc.commands?.length ?? 0) + (behaviourDoc.events?.length ?? 0)), findings: eventFindings.length },
    { id: "automations", label: t("automations"), status: layerStatus(active.domain?.policies?.length, flowDoc.policies?.length ?? 0), findings: policyFindings.length },
    { id: "roles", label: t("roles"), status: layerStatus(active.roles, rolesDoc.roles.length), findings: roleFindings.length },
    { id: "workflows", label: t("workflows"), status: layerStatus(active.workflows, workflowsDoc.workflows.length), findings: workflowFindings.length },
    { id: "agents", label: t("agents"), status: layerStatus(active.agents, agentsDoc.agents.length), findings: agentFindings.length },
    { id: "code", label: t("viewCode"), status: "ready", findings: 0 },
  ];
  const stageGen: Partial<Record<StageId, { run: () => void; busy: boolean; label: string }>> = {
    capabilities: { run: () => void generate(), busy, label: t("generateBtn") },
    areas: { run: () => void generateAreas(), busy: contextsBusy, label: t("genAreas") },
    entities: { run: () => void generateDomainModel(), busy: domainBusy, label: t("genEntities") },
    behaviour: { run: () => void generateBehaviour(), busy: behaviourBusy, label: t("genBehaviour") },
    automations: { run: () => void generatePoliciesModel(), busy: policiesBusy, label: t("genAutomations") },
    roles: { run: () => void generateRolesModel(), busy: rolesBusy, label: t("genRoles") },
    workflows: { run: () => void generateWorkflowsModel(), busy: workflowsBusy, label: t("genWorkflows") },
    agents: { run: () => void generateAgentsModel(), busy: agentsBusy, label: t("genAgents") },
  };
  const stageFindings: Partial<Record<StageId, typeof capFindings>> = {
    capabilities: capFindings, areas: contextFindings, entities: domainFindings, behaviour: eventFindings,
    automations: policyFindings, roles: roleFindings, workflows: workflowFindings, agents: agentFindings,
  };
  const REVIEW_KIND: Partial<Record<StageId, LayerKind>> = {
    capabilities: "capabilities", areas: "areas", entities: "entities", behaviour: "behaviour",
    automations: "automations", roles: "roles", workflows: "workflows", agents: "agents",
  };
  const activeStage = stages.find((s) => s.id === stage) ?? stages[1];

  // Resolve any artifact id (capability / area-node / entity / command / event / role / agent) to a
  // display name — used to label breadcrumb segments for the current selection.
  const nameFor = (id: string): string => {
    const cap = activeDoc.capabilities.find((c) => c.id === id); if (cap) return cap.name || id;
    const area = contextsDoc.contexts.find((c) => contextNodeId(c.id) === id || c.id === id); if (area) return area.name || id;
    const agg = domainDoc.aggregates.find((a) => a.id === id); if (agg) return agg.name || id;
    const cmd = (behaviourDoc.commands ?? []).find((c) => c.id === id); if (cmd) return cmd.name || id;
    const ev = (behaviourDoc.events ?? []).find((e) => e.id === id); if (ev) return ev.name || id;
    const pol = (flowDoc.policies ?? []).find((p) => p.id === id); if (pol) return pol.name || id;
    const role = rolesDoc.roles.find((r) => r.id === id); if (role) return role.name || id;
    const agent = agentsDoc.agents.find((a) => a.id === id); if (agent) return agent.name || id;
    return id;
  };
  const stageLabelOf = (s: StageId): string => stages.find((x) => x.id === s)?.label ?? s;
  // Is this id any known artifact? (broadens finding subjects beyond capabilities so behaviour/
  // automation/role findings can highlight + navigate too.)
  const isArtifact = (id: string): boolean =>
    activeDoc.capabilities.some((c) => c.id === id) ||
    contextsDoc.contexts.some((c) => contextNodeId(c.id) === id || c.id === id) ||
    domainDoc.aggregates.some((a) => a.id === id) ||
    (behaviourDoc.commands ?? []).some((c) => c.id === id) ||
    (behaviourDoc.events ?? []).some((e) => e.id === id) ||
    (flowDoc.policies ?? []).some((p) => p.id === id) ||
    rolesDoc.roles.some((r) => r.id === id) ||
    agentsDoc.agents.some((a) => a.id === id);
  // What the diagrams should glow: a hovered finding wins over the sticky selection.
  const highlightId = hovered ?? selected;
  // The detail panel only opens for artifacts that HAVE a detail view (area / entity / capability);
  // selecting a command/role/etc. just highlights the canvas without an empty slide-in.
  const selectedCap = selected ? activeDoc.capabilities.find((c) => c.id === selected) : undefined;
  const hasDetail = !!(selectedArea || selectedAggregate || selectedCap);

  return (
    <div className={`app shell${sidebarOpen ? "" : " sidebar-collapsed"}`}>
      {import.meta.env.VITE_PUBLIC_DEMO && (
        <div className="demo-banner">
          🔥 <strong>Public demo</strong> — real AI generation is disabled here (no key). Explore the example
          businesses, walk every stage, and export the code — then{" "}
          <a href="https://github.com/ziffr/kiln" target="_blank" rel="noreferrer">run your own Kiln</a> with
          your own Anthropic key.
        </div>
      )}
      {dialog?.kind === "input" && (
        <InputDialog title={dialog.title} label={dialog.label} initial={dialog.initial} multiline={dialog.multiline}
          submitLabel={dialog.submitLabel} cancelLabel={t("cancel")} onSubmit={dialog.onSubmit} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "confirm" && (
        <ConfirmDialog title={dialog.title} message={dialog.message} confirmLabel={dialog.confirmLabel} cancelLabel={t("cancel")}
          danger={dialog.danger} onConfirm={dialog.onConfirm} onClose={() => setDialog(null)} />
      )}
      {studioLocked && (
        <InputDialog title={t("studioLockTitle")} label={t("studioLockLabel")} placeholder={t("studioLockPlaceholder")} password
          submitLabel={t("save")} cancelLabel={t("cancel")}
          onSubmit={(v) => { if (v.trim()) localStorage.setItem(STUDIO_TOKEN_KEY, v.trim()); }}
          onClose={() => setStudioLocked(false)} />
      )}
      {showGuide && <Guide onClose={() => setShowGuide(false)} />}
      {showExamples && <ExamplesModal onPick={pickExample} onClose={() => setShowExamples(false)} t={t} />}
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
      {enrichProps !== null && (
        <EnrichPanel
          proposals={enrichProps}
          onToggle={toggleEnrich}
          onApply={applyEnrich}
          onClose={() => setEnrichProps(null)}
          onWeb={serverUp ? enrichWeb : undefined}
          webBusy={enrichWebBusy}
          t={t}
        />
      )}
      {showReview && (
        <div className="guide-overlay" onClick={() => setShowReview(false)}>
          <div className="guide review-overlay" onClick={(e) => e.stopPropagation()}>
            <div className="guide-head"><h2><Icon name="sparkles" size={18} />{t("aiReviewTitle")}</h2><button className="nd-close" onClick={() => setShowReview(false)} aria-label="close"><Icon name="x" size={16} /></button></div>
            <div className="guide-body">
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
                onSelect={(f) => { selectFinding(f); setShowReview(false); }}
                onSettings={() => { setShowReview(false); setShowSettings(true); }}
                autoRunning={autoRunning}
                autoLayer={autoLayer}
                onAuto={() => void autoReview()}
                onStop={() => { autoStopRef.current = true; }}
                t={t}
              />
            </div>
          </div>
        </div>
      )}
      <aside className="side">
        <div className="side-team">
          <div className="side-mark"><Icon name="flame" size={17} /></div>
          <div className="side-team-name">
            <div className="side-title">{t("appTitle")}</div>
            <div className="side-sub muted">{t("brandTagline")}</div>
          </div>
        </div>

        {/* One Project cluster: switch/create (top), then manage (rename/delete) + file save/load
            (export/import the whole model.json) in a single tool row — so "open a project" and "save a
            project" live together, instead of being split between this bar and the footer. */}
        <div className="side-project">
          <div className="projectbar">
            <select
              value={active.id}
              onChange={(e) => {
                setState((s) => ({ ...s, activeId: e.target.value }));
                navRoot(stage);
              }}
            >
              {state.projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button onClick={addProject} title={t("newProject")} aria-label={t("newProject")}><Icon name="plus" /></button>
          </div>
          <div className="project-tools">
            <button onClick={() => setShowExamples(true)} title={t("examplesOpen")} aria-label={t("examplesOpen")}><Icon name="grid" size={15} /></button>
            <button onClick={renameProject} title={t("rename")} aria-label={t("rename")}><Icon name="pencil" size={15} /></button>
            <button onClick={deleteProject} disabled={state.projects.length <= 1} title={t("del")} aria-label={t("del")}><Icon name="trash" size={15} /></button>
            <span className="pt-spacer" />
            <button onClick={() => modelFileRef.current?.click()} title={t("importModelHint")} aria-label={t("importModel")}><Icon name="upload" size={15} /></button>
            <button onClick={exportModel} title={t("exportModelHint")} aria-label={t("exportModel")}><Icon name="download" size={15} /></button>
            <input ref={modelFileRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void importModel(f); e.target.value = ""; }} />
          </div>
          <button className="project-desc" onClick={editDescription} title={t("descriptionHint")}>
            {active.description || <span className="muted">+ {t("addDescription")}</span>}
          </button>
        </div>

        <StageRail stages={stages} active={stage} onSelect={(s) => navRoot(s)} t={t} />

        <div className="side-foot">
          <button className="side-foot-btn" onClick={() => setShowGuide(true)}><Icon name="book" size={15} /> {t("guideOpen")}</button>
          <button className="side-foot-btn" onClick={() => setShowSettings(true)}><Icon name="settings" size={15} /> {t("settingsOpen")}</button>
          <div className="lang">
            <span>{t("language")}:</span>
            {(["de", "en"] as const).map((lng) => (
              <button key={lng} className={i18n.language === lng ? "active" : ""} onClick={() => void i18n.changeLanguage(lng)}>
                {lng.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="side-user">
            <div className="side-ava" />
            <div className="leading"><div className="side-user-name">Local</div><div className="side-sub muted">workspace</div></div>
          </div>
        </div>
      </aside>

      <div className="inset">
        <header className="inset-top">
          <button className="side-toggle" onClick={() => setSidebarOpen((v) => !v)} aria-label={t("stages")}><Icon name="menu" size={18} /></button>
          <nav className="crumbs" aria-label={t("breadcrumb")}>
            {trail.map((e, i) => {
              const last = i === trail.length - 1;
              const label = e.id ? nameFor(e.id) : stageLabelOf(e.stage);
              return (
                <span key={`${e.stage}:${e.id ?? ""}:${i}`} className="crumb-seg">
                  {i > 0 && <Icon name="chevronRight" size={13} className="crumb-sep" />}
                  {last ? (
                    <span className="crumb-cur">{label}</span>
                  ) : (
                    <button className="crumb-link" onClick={() => navTo(e.stage, e.id)}>{label}</button>
                  )}
                </span>
              );
            })}
          </nav>
          <button className="ai-review-top" onClick={() => setShowReview(true)}><Icon name="sparkles" size={15} />{t("aiReviewTitle")}</button>
        </header>

        <div className={`inset-body${hasDetail ? " has-detail" : ""}`}>
        <main className="stage-main">
          <div className="stage-head">
            <div className="stage-title">
              <h2>{activeStage.label}</h2>
              <p className="stage-desc muted">{t(`stageDesc_${stage}`)}</p>
            </div>
            {/* Grouped by intent: manual "add" (structural) and "enrich" (AI-adds) on the left, the
                primary "generate" on the right. Review lives in ONE place — the top-right AI-review
                panel (which already runs per layer); Auto is folded into Enrich (Apply = apply all). */}
            <div className="stage-actions">
              {stage === "capabilities" && <button className="btn ghost" onClick={addCapability}><Icon name="plus" />{t("addCap")}</button>}
              {stage === "areas" && <button className="btn ghost" onClick={addArea}><Icon name="plus" />{t("addArea")}</button>}
              {(["entities", "capabilities", "roles", "agents"] as const).includes(stage as never) && (
                <button className="btn ghost" onClick={() => (stage === "entities" ? runEnrichGrounded() : runLayerEnrich(stage as EnrichLayer))} title={t("enrichHint")}>
                  <Icon name="sparkles" />{t("enrich")}
                </button>
              )}
              {stageGen[stage] && (
                <button className="btn primary" onClick={stageGen[stage]!.run} disabled={stageGen[stage]!.busy}>
                  <Icon name="sparkles" />{stageGen[stage]!.busy ? t("generating") : stageGen[stage]!.label}
                </button>
              )}
            </div>
          </div>

          {error && <p className="err-line"><code>{error}</code> &mdash; {t("serviceHint")}</p>}

          <div className="stage-body">
            {stage === "narrative" && (
              <div className="narrative-stage">
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
                <div className="lists narrative-summary">
                  <div><h3>{t("outcomes")}</h3><ul>{businessOutcomes(doc).map((o) => <li key={o}>{o}</li>)}</ul></div>
                  <div><h3>{t("activities")}</h3><ul>{coreActivities(doc).map((a) => <li key={a}>{a}</li>)}</ul></div>
                  <div><h3>{t("customers")}</h3><ul>{customers(doc).map((c) => <li key={c}>{c}</li>)}</ul></div>
                </div>
              </div>
            )}
            {stage === "capabilities" && <div className="map-wrap"><CapabilityMap ir={ir} areaOf={new Map()} selectedId={highlightId} onSelect={(id) => navTo("capabilities", id)} /></div>}
            {stage === "areas" && <AreaDiagram contexts={contextsDoc} caps={activeDoc} colors={AREA_COLORS} onSelectArea={(id) => navTo("areas", contextNodeId(id))} onSelectCap={(id) => navTo("capabilities", id)} t={t} />}
            {stage === "entities" && <EntityDiagram domain={domainDoc} caps={activeDoc} selectedId={highlightId} onSelect={(id) => navTo("entities", id)} />}
            {stage === "behaviour" && <BehaviourView domain={behaviourDoc} highlight={selectedAggregate?.id} highlightId={highlightId} t={t} />}
            {stage === "automations" && <AutomationsView domain={flowDoc} highlight={selectedAggregate?.id} highlightId={highlightId} t={t} />}
            {stage === "roles" && <RolesMatrix roles={rolesDoc} caps={activeDoc} highlightCap={hovered ?? selectedAggregate?.owner ?? selected} highlightId={highlightId} t={t} />}
            {stage === "workflows" && <WorkflowsView workflows={workflowsDoc} domain={behaviourDoc} t={t} onSetMode={setWorkflowMode} onSetService={setWorkflowService} onBindStep={setWorkflowStepBinding} onClassify={classifyOrchestration} classifyBusy={orchestrationBusy} rationales={orchestrationRationales} services={serviceOptions} />}
            {stage === "agents" && <AgentDiagram agents={agentsDoc} caps={activeDoc} onSelect={(id) => navTo("capabilities", id)} t={t} />}
            {stage === "code" && (
              <CodePreview
                caps={activeDoc}
                domain={flowDoc}
                contexts={contextsDoc}
                roles={rolesDoc}
                workflows={workflowsDoc}
                agents={agentsDoc}
                requestAppLogic={async (feedback?: string) => {
                  const res = await fetch(`${SERVICE_URL}/api/app-logic`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ capabilities: activeDoc, domain: flowDoc, contexts: contextsDoc, feedback, model: modelFor("behaviour"), effort: active.effort }) });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                  setSpend({ estCostUsd: data.estCostUsd, sessionSpendUsd: data.sessionSpendUsd, usage: data.usage });
                  return data as { handlers: Record<string, string>; written: number; skipped: number };
                }}
                requestAppComponents={async () => {
                  const res = await fetch(`${SERVICE_URL}/api/app-components`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ capabilities: activeDoc, domain: flowDoc, contexts: contextsDoc, model: modelFor("entities"), effort: active.effort }) });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                  setSpend({ estCostUsd: data.estCostUsd, sessionSpendUsd: data.sessionSpendUsd, usage: data.usage });
                  return data as { views: Record<string, unknown>; written: number; skipped: number };
                }}
                requestVerify={async (files) => {
                  const res = await fetch(`${SERVICE_URL}/api/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files }) });
                  return await res.json();
                }}
                requestCodeReview={async (handlerCode) => {
                  const res = await fetch(`${SERVICE_URL}/api/code-review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ capabilities: activeDoc, domain: flowDoc, contexts: contextsDoc, roles: rolesDoc, handlerCode, model: modelFor("behaviour") }) });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                  setSpend({ estCostUsd: data.estCostUsd, sessionSpendUsd: data.sessionSpendUsd, usage: data.usage });
                  return data.findings ?? [];
                }}
                buildModel={() =>
                  assembleModel(
                    { name: active.name, description: active.description, narrative: text, capabilities: activeDoc, contexts: contextsDoc, domain: flowDoc, roles: rolesDoc, workflows: workflowsDoc, agents: agentsDoc },
                    active,
                  )
                }
                onClose={() => navTo("capabilities", null)}
              />
            )}
          </div>

          {stageFindings[stage] && stageFindings[stage]!.length > 0 && (
            <ul className="findings cap-findings">
              {stageFindings[stage]!.map((f) => {
                const subj = f.subjects.find(isArtifact);
                return <li key={f.id} className={subj ? "clickable" : ""} onClick={() => subj && navTo(stage, subj)} onMouseEnter={() => subj && setHovered(subj)} onMouseLeave={() => setHovered(null)}><code className={f.severity}>{f.code}</code> {f.message}</li>;
              })}
            </ul>
          )}
          {REVIEW_KIND[stage] && critique[REVIEW_KIND[stage]!] && (
            <ul className="findings cap-findings critique-inline">
              <li className="findings-head muted"><Icon name="sparkles" size={13} /> {t("aiReviewTitle")}</li>
              {critique[REVIEW_KIND[stage]!]!.length === 0 && <li className="muted">{t("aiReviewOk")}</li>}
              {critique[REVIEW_KIND[stage]!]!.map((f) => (
                <li key={f.id} className={f.target ? "clickable" : ""} onClick={() => f.target && selectFinding(f)} onMouseEnter={() => f.target && setHovered(findingTargetId(f))} onMouseLeave={() => setHovered(null)}>
                  <code className={f.severity === "concern" ? "major" : "minor"}>{t(`sev_${f.severity}`)}</code> {f.message}{f.suggestion ? ` → ${f.suggestion}` : ""}
                </li>
              ))}
            </ul>
          )}

          {spend && (
            <p className="spend" title={t("creditNote")}>
              &#128179; ${spend.estCostUsd.toFixed(4)} {t("thisCall")} &middot; ${spend.sessionSpendUsd.toFixed(4)} {t("thisSession")}
              <span className="muted"> &middot; {spend.usage.input + spend.usage.output} {t("tokens")}</span>
            </p>
          )}
        </main>

        {/* Detail is a slide-in: rendered only when something is selected, so the canvas reflows to
            full width when nothing is (no permanently-reserved empty column). */}
        {hasDetail && selected && (
          <aside className="stage-detail">
            {selectedArea ? (
              <AreaDetail area={selectedArea} doc={activeDoc} terms={areaTerms(selectedArea)} onEdit={editArea} onRetire={retireArea} onSelectCapability={(id) => navTo("capabilities", id)} onClose={() => navTo(stage, null)} />
            ) : selectedAggregate ? (
              <EntityTrace entity={selectedAggregate} domain={flowDoc} caps={activeDoc} roles={rolesDoc} onSelectCap={(id) => navTo("capabilities", id)} onSelectEntity={(id) => navTo("entities", id)} onGo={(s) => navTo(s, selected)} onClose={() => navTo(stage, null)} t={t} />
            ) : (
              <NodeDetail
                doc={activeDoc}
                aggregates={domainDoc.aggregates}
                commands={behaviourDoc.commands ?? []}
                events={behaviourDoc.events ?? []}
                policies={flowDoc.policies ?? []}
                capRoles={rolesForCap(selected)}
                areas={contextsDoc.contexts.map((c) => ({ id: c.id, name: c.name }))}
                capAreaId={areaOf.get(selected)?.id}
                onReassignArea={reassignCapabilityArea}
                selectedId={selected}
                onEdit={editCapability}
                onDelete={deleteCapability}
                onEditAggregate={editAggregate}
                onDeleteAggregate={deleteAggregate}
                onAddAggregate={addAggregate}
                onClose={() => navTo(stage, null)}
              />
            )}
          </aside>
        )}
        </div>
      </div>
    </div>
  );
}
