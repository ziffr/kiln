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
import { mockGenerateCapabilities, mockGenerateDomain, mockGroupContexts, mockGenerateEvents, mockGeneratePolicies, mockGenerateRoles, mockGenerateWorkflows, mockGenerateAgents, mockEnrichDomain, applyEnrichment, critiqueToFeedback, diffCritique, concernsMatch, parseFinding, resolveTarget, CRITIQUE_EFFORT, LAYER_TIER, type Tier, type LayerKind, type CritiqueFinding, type CritiqueDiff } from "@kiln/skills";
import { flattenEnrichment, rebuildEnrichment, type EnrichProposal } from "./enrichReview";
import { flattenLayerItems, applyLayerItems, groundedLayerItems, type EnrichLayer } from "./layerEnrich";
import { EnrichPanel } from "./components/EnrichPanel";
import { mockExternalServices } from "@kiln/codegen";
import { SettingsModal } from "./components/SettingsModal";
import { CapabilityMap } from "./components/CapabilityMap";
import { StageRail, type StageId, type StageInfo } from "./components/StageRail";
import { StageGuide } from "./components/StageGuide";
import { BehaviourView, AutomationsView, RolesMatrix, WorkflowsView } from "./components/StageViews";
import { EntityDiagram } from "./components/EntityDiagram";
import { AreaDiagram } from "./components/AreaDiagram";
import { AgentDiagram } from "./components/AgentDiagram";
import { EntityTrace } from "./components/EntityTrace";
import { NodeDetail } from "./components/NodeDetail";
import { WorkflowDetail } from "./components/WorkflowDetail";
import { AreaDetail } from "./components/AreaDetail";
import { CodePreview } from "./components/CodePreview";
import { InputDialog, ConfirmDialog } from "./components/Modal";
import { STUDIO_TOKEN_KEY } from "./studio-auth";
import { Icon } from "./components/Icon";

type DialogState =
  | { kind: "input"; title: string; label?: string; initial?: string; multiline?: boolean; submitLabel: string; onSubmit: (value: string) => void }
  | { kind: "confirm"; title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void };
import { ReviewPanel } from "./components/ReviewPanel";
import { Home } from "./components/Home";
import { VersionsModal } from "./components/VersionsModal";
import { ExamplesModal } from "./components/ExamplesModal";
import { ProjectsModal } from "./components/ProjectsModal";
import { findingFix } from "./findingFix";
import { NarrativeInput } from "./components/NarrativeInput";
import {
  loadProjects,
  saveProjects,
  newProject,
  uid,
  isExampleProject,
  NARRATIVE_TEMPLATE,
  type Project,
  type ProjectState,
} from "./projects";

/** True only when the narrative has real content — an untouched new-project template counts as empty, so
 *  a fresh project shows the welcome hero (not a zeros dashboard) and skips the auto-summary LLM call. */
const hasRealNarrative = (n: string): boolean => n.trim().length > 0 && n.trim() !== NARRATIVE_TEMPLATE.trim();
import { serverListProjects, serverSaveProject, serverDeleteProject } from "./projectStore";
import { assembleModel, parseModel, type ResolvedCore } from "./model";
import { SERVICE_URL, DOCS_URL } from "./config";



// LLM engine catalog. Kiln is Anthropic-first; the open-source build also allows OpenAI-compatible
// gateways (OpenRouter / omniroute). The SERVER decides which engines are actually available (which key
// is set) and returns them from /api/models; this static list is the fallback before that responds and
// in the client-only demo (no /api). See apps/service/src/models.ts for the authoritative catalog.
interface ModelOpt { id: string; label: string; provider: string; supportsEffort: boolean; inPerM: number; outPerM: number }
interface ProviderCat { id: string; label: string; models: ModelOpt[]; allowCustomModel: boolean; defaultModel: string; note?: string }
const FALLBACK_PROVIDERS: ProviderCat[] = [
  {
    id: "anthropic",
    label: "Anthropic (recommended)",
    allowCustomModel: false,
    defaultModel: "claude-sonnet-5",
    models: [
      { id: "claude-sonnet-5", label: "Sonnet 5", provider: "anthropic", supportsEffort: true, inPerM: 2, outPerM: 10 },
      { id: "claude-opus-4-8", label: "Opus 4.8", provider: "anthropic", supportsEffort: true, inPerM: 5, outPerM: 25 },
      { id: "claude-haiku-4-5", label: "Haiku 4.5", provider: "anthropic", supportsEffort: false, inPerM: 1, outPerM: 5 },
    ],
  },
];
// Rough tokens per model call (input/output), used only for the Auto cost estimate. Deliberately a
// ballpark — the confirm shows a ±range, and the real per-call spend is reported after each call.
const EST_IN_TOKENS = 2000;
const EST_OUT_TOKENS = 800;
const EFFORTS = ["low", "medium", "high", "max"];
// Adaptive Anthropic defaults: when Adaptive is on and a stage runs on Anthropic with no explicit
// per-stage override, its model + effort come from the layer's TIER — heavy reasoning stages get
// Opus/high, standard stages Sonnet, mechanical (light) stages Haiku — instead of a flat global
// default. Per-stage Settings overrides always win; gateways keep the flat default (no tier equivalent).
const ANTHROPIC_TIER_MODEL: Record<Tier, string> = { heavy: "claude-opus-4-8", standard: "claude-sonnet-5", light: "claude-haiku-4-5" };
const GEN_EFFORT_TIER: Record<Tier, string> = { heavy: "high", standard: "medium", light: "medium" };
// polish/visual aren't modeling layers → treat them as standard (Sonnet) design passes.
const stageTier = (stage: string): Tier => LAYER_TIER[stage as LayerKind] ?? "standard";

// A partial model override — lets the auto-review loop feed just-refined docs into the next
// Review/Refine without waiting for React's async state to flush (which would leave them stale).
interface ModelOverride {
  contexts?: ContextsDoc;
  domain?: DomainDoc;
  roles?: RolesDoc;
  workflows?: WorkflowsDoc;
  agents?: AgentsDoc;
}

// Entities, behaviour and automations all live on the single `domain` doc, so applying (regenerating) an
// upstream one overwrites the downstream ones: entities' fresh domain has no commands/events/policies, and
// behaviour's refine drops policies. Areas/roles/workflows/agents own separate docs → they reset nothing
// below. This map is the real Apply cascade (narrower than the destructive-Generate guard's atRiskCount).
const APPLY_RESETS_BELOW: Partial<Record<LayerKind, LayerKind[]>> = {
  entities: ["behaviour", "automations"],
  behaviour: ["automations"],
};

export default function App(): React.JSX.Element {
  const { t, i18n } = useTranslation();

  // ---- Projects: server-backed when reachable, localStorage cache/fallback (ADR-006) ----
  const [state, setState] = useState<ProjectState>(() => loadProjects()); // instant local render
  const [serverUp, setServerUp] = useState(false);
  // LLM engine catalog — narrowed by the server to the engines whose key is configured (/api/models).
  const [catalog, setCatalog] = useState<ProviderCat[]>(FALLBACK_PROVIDERS);
  const [defaultEngine, setDefaultEngine] = useState<string>("anthropic");
  useEffect(() => saveProjects(state), [state]); // always mirror to localStorage (+ activeId pref)
  useEffect(() => { // studio lock: studio-auth.ts signals a locked /api; ask for the passphrase in-app
    const onLocked = () => setStudioLocked(true);
    window.addEventListener("kiln:studio-locked", onLocked);
    return () => window.removeEventListener("kiln:studio-locked", onLocked);
  }, []);
  const active = state.projects.find((p) => p.id === state.activeId) ?? state.projects[0];

  // ---- LLM engine selection (Anthropic default; OpenRouter / omniroute when configured server-side) ----
  // Fetch the configured-engine catalog once; falls back to Anthropic-only if /api is unreachable (demo).
  useEffect(() => {
    let cancelled = false;
    void fetch(`${SERVICE_URL}/api/models`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { providers?: ProviderCat[]; defaultProvider?: string } | null) => {
        if (cancelled || !d?.providers?.length) return;
        setCatalog(d.providers);
        if (d.defaultProvider) setDefaultEngine(d.defaultProvider);
      })
      .catch(() => {/* offline / client-only demo → keep the fallback catalog */});
    return () => { cancelled = true; };
  }, []);
  // The full flat model list (all engines) — cross-engine lookups (pricing/effort/label of a saved model).
  const MODELS = catalog.flatMap((p) => p.models);
  const engine = active?.engine && catalog.some((p) => p.id === active.engine) ? active.engine : defaultEngine;
  const engineProvider = catalog.find((p) => p.id === engine) ?? catalog[0] ?? FALLBACK_PROVIDERS[0];
  const engineModels = engineProvider.models; // the models the CURRENT engine offers (for the selectors)
  // Coerce the saved model to the current engine: a project saved on another engine (or an engine that's
  // no longer configured) can carry a model id this engine doesn't offer — fall back to the engine default
  // rather than showing/sending a stale slug. Free-text ids on gateways (allowCustomModel) are kept.
  const globalModel =
    engineModels.some((m) => m.id === active?.model) || (engineProvider.allowCustomModel && Boolean(active?.model))
      ? (active!.model as string)
      : engineProvider.defaultModel;

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

  // SPEC-011 M5: the label the NEXT auto-save should carry (set by an action like "generate behaviour"),
  // so the version timeline reads meaningfully instead of a generic "save". Cleared once consumed.
  const versionLabelRef = useRef<string | null>(null);
  const labelNextSave = (label: string): void => { versionLabelRef.current = label; };

  // Persist the active project to the server (debounced) whenever it changes, tagging the version with
  // whatever action label is pending (else the server's default "save: <name>").
  useEffect(() => {
    if (!serverUp || !active) return;
    const timer = setTimeout(() => {
      const label = versionLabelRef.current;
      versionLabelRef.current = null;
      void serverSaveProject(active, label ?? undefined);
    }, 700);
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
  // Cumulative tokens this page-session (the per-call `usage` above is only the latest call). Feeds the
  // Home usage KPI; cost uses the server's running `sessionSpendUsd`. Both reset on reload (ballpark).
  const [sessionTokens, setSessionTokens] = useState(0);
  const applySpend = (data: { estCostUsd: number; sessionSpendUsd: number; usage: { input: number; output: number } }): void => {
    setSpend({ estCostUsd: data.estCostUsd, sessionSpendUsd: data.sessionSpendUsd, usage: data.usage });
    setSessionTokens((n) => n + (data.usage?.input ?? 0) + (data.usage?.output ?? 0));
  };

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
  // Layers whose (previously reviewed) AI critique was invalidated because an upstream Apply regenerated
  // them (see APPLY_RESETS_BELOW). We can't know for free whether the regenerated content is now clean —
  // that's an LLM judgment — so instead of a misleading "not reviewed" we flag "changed upstream", nudging
  // a cheap re-review. Cleared when the layer is reviewed or applied.
  const [staleReview, setStaleReview] = useState<Partial<Record<LayerKind, boolean>>>({});
  // Round-over-round: the delta of the latest review vs the previous one (still-open/new/resolved), and
  // how many times each layer has been reviewed (drives the "diminishing returns" nudge). `lastReviewedRef`
  // holds the prior round's findings to diff against — it survives an Apply (which clears `critique`) so a
  // post-Apply re-review is compared against what was applied.
  const [critiqueDiff, setCritiqueDiff] = useState<Partial<Record<LayerKind, CritiqueDiff>>>({});
  const [reviewCount, setReviewCount] = useState<Partial<Record<LayerKind, number>>>({});
  // Every review round's findings per layer (this session). The last entry is the baseline for the next
  // diff; the union of all-but-last powers recurrence detection (spotting an oscillating layer).
  const reviewHistoryRef = useRef<Partial<Record<LayerKind, CritiqueFinding[][]>>>({});
  const capSig = activeDoc.capabilities.map((c) => c.id).join(",");
  useEffect(() => {
    // A capability change (or project switch) restarts the review dialogue from scratch.
    setCritique({});
    setCritiqueDiff({});
    setReviewCount({});
    reviewHistoryRef.current = {};
  }, [capSig]);
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
  const [showExamples, setShowExamples] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  // The welcome screen is the default landing so a newcomer gets oriented before the mid-pipeline map.
  const [showHome, setShowHome] = useState(true);
  const [showIssues, setShowIssues] = useState(true);
  // Open by default on desktop; collapsed on a phone (where the sidebar is an off-canvas overlay).
  const [sidebarOpen, setSidebarOpen] = useState(() => (typeof window === "undefined" ? true : window.innerWidth > 720));
  const [showSettings, setShowSettings] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [stage, setStage] = useState<StageId>("capabilities");
  // Navigation history for the breadcrumb: every in-screen jump appends; clicking a crumb (or an artifact
  // already visited) truncates back to it; using the left rail resets the trail to a fresh root.
  const [trail, setTrail] = useState<{ stage: StageId; id: string | null }[]>([{ stage: "capabilities", id: null }]);
  // Central navigation: the ONE way to change stage+selection so the trail stays honest.
  function navTo(nextStage: StageId, id: string | null = null): void {
    setShowHome(false);
    setStage(nextStage);
    setSelected(id);
    setTrail((prev) => {
      const i = prev.findIndex((e) => e.stage === nextStage && e.id === id);
      return i >= 0 ? prev.slice(0, i + 1) : [...prev, { stage: nextStage, id }];
    });
  }
  // A top-level jump (left rail / project switch): start a fresh trail rooted at this stage.
  function navRoot(nextStage: StageId): void {
    setShowHome(false);
    setStage(nextStage);
    setSelected(null);
    setTrail([{ stage: nextStage, id: null }]);
  }
  // When a finding is hovered/selected, scroll its now-glowing artifact into view — on tall stages the
  // match is often far below the fold, so highlighting alone isn't visible. Runs after the .hot class
  // lands (post-render). Only the hand-rolled scrolling diagrams mark boxes with .hot/.hot-col.
  useEffect(() => {
    if (!(hovered ?? selected)) return;
    const el = document.querySelector(".stage-body .hot, .stage-body .hot-col");
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [hovered, selected, stage]);
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
  // A selected workflow (pseudo-id "wf:<id>") opens its routing/steps detail.
  const selectedWorkflow = selected?.startsWith("wf:") ? workflowsDoc.workflows.find((w) => `wf:${w.id}` === selected) : undefined;
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
    patchActive({ narrative: v, homeSummary: undefined, openQuestions: undefined, capabilities: null, provider: null, domain: null, contexts: null, roles: null, workflows: null, agents: null });
    setSelected(null);
  }

  // ── Narrative sync (one-way, human-reviewed) ────────────────────────────────────────────────────
  // Hand-made fixes land in the model but not in the narrative, so the prose silently falls behind. This
  // proposes narrative sentences for the model's business rules the narrative doesn't state; the human
  // reviews and appends. It's a RECONCILING edit — bring the narrative up to date WITH the model — so it
  // does NOT reset downstream (unlike setNarrative). It keeps the prose honest; it is NOT a promise that
  // regenerating from the narrative would reproduce these exact facts.
  const [narrativeSyncBusy, setNarrativeSyncBusy] = useState(false);
  function appendNarrative(block: string): void {
    const b = block.trim();
    if (!b) return;
    const base = (active.narrative ?? "").trimEnd();
    patchActive({ narrative: base ? `${base}\n\n${b}\n` : `${b}\n` });
  }
  async function syncNarrativeModel(): Promise<void> {
    const facts = (flowDoc.policies ?? []).map((p) => `When ${nameFor(p.on)} happens, ${nameFor(p.then)} is triggered.`);
    if (!facts.length) return;
    setNarrativeSyncBusy(true);
    setError(null);
    try {
      const res = await fetch(`${SERVICE_URL}/api/narrative-sync`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ narrative: active.narrative ?? "", facts, ...stageCfg("capabilities") }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      applySpend(data);
      const additions = (data.additions ?? []) as string[];
      if (!additions.length) {
        setDialog({ kind: "confirm", title: t("narrativeSyncTitle"), message: t("narrativeSyncClean"), confirmLabel: t("aiDone"), onConfirm: () => {} });
        return;
      }
      const block = `## ${t("narrativeSyncHeading")}\n${additions.map((a) => `- ${a}`).join("\n")}`;
      setDialog({
        kind: "input", title: t("narrativeSyncTitle"), label: t("narrativeSyncLabel"),
        initial: block, multiline: true, submitLabel: t("narrativeSyncApply"), onSubmit: appendNarrative,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setNarrativeSyncBusy(false);
    }
  }

  async function generate(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${SERVICE_URL}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ narrative: text, ...stageCfg("capabilities") }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      // A fresh capability set invalidates prior domain/areas/roles snapshots → back to the live mock.
      patchActive({ capabilities: data.doc as CapabilityDoc, provider: data.provider as string, domain: null, contexts: null, roles: null, workflows: null, agents: null });
      applySpend(data);
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
        body: JSON.stringify({ capabilities: activeDoc, ...stageCfg("entities") }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      patchActive({ domain: data.doc });
      applySpend(data);
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
  // Remove an authored automation (policy). This is the concrete fix for the PL6 self-loop / PL7 cycle
  // findings ("remove one link"): a policy IS the event→command link, so deleting it breaks the cycle.
  function deletePolicy(id: string): void {
    const base = active.domain;
    if (!base?.policies?.some((p) => p.id === id)) return; // only authored policies are deletable
    const pol = base.policies.find((p) => p.id === id);
    setDialog({
      kind: "confirm", title: t("removeAutomation"), message: `${t("removeAutomationConfirm")}${pol?.name ? ` „${pol.name}“` : ""}`,
      confirmLabel: t("del"), danger: true,
      onConfirm: () => patchActive({ domain: { ...base, policies: base.policies!.filter((p) => p.id !== id) } }),
    });
  }

  // ---- Surgical single-finding fix (SPEC-005/002 closure) ----------------------------------------
  // Turn a parseable critique suggestion into ONE deterministic model edit — add the reaction, type the
  // field, wire the reference — instead of regenerating the whole layer. This is the CONVERGENT fix: the
  // concern is genuinely gone, so a re-review won't re-raise it. Returns an apply-fn, or null when the
  // suggestion can't be resolved to real nodes (the UI then offers only "fix by hand").
  const normId = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const attrNameOf = (x: unknown): string => (typeof x === "string" ? x : (x as { name: string }).name);
  const tokenize = (s: string): Set<string> => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const subset = (a: Set<string>, b: Set<string>): boolean => a.size > 0 && [...a].every((w) => b.has(w));
  // Resolve an LLM-referenced name/id to a real node. Exact (normalized) match first; else a UNIQUE
  // token-subset match (the critic often abbreviates an id) — ambiguous or absent ⇒ null, so we never
  // silently wire the wrong node (the UI then offers only manual fix).
  function resolveNode<T extends { id: string; name: string }>(ref: string, list: T[]): T | undefined {
    const exact = list.find((x) => normId(x.id) === normId(ref) || normId(x.name) === normId(ref));
    if (exact) return exact;
    const rt = tokenize(ref);
    const cand = list.filter((x) => subset(rt, tokenize(x.id)) || subset(rt, tokenize(x.name)));
    return cand.length === 1 ? cand[0] : undefined;
  }
  function resolveFix(layer: LayerKind, f: CritiqueFinding): (() => void) | null {
    const intent = parseFinding(layer, f);
    if (!intent) return null;
    if (intent.kind === "addPolicy") {
      const ev = resolveNode(intent.on, behaviourDoc.events ?? []);
      const cmd = resolveNode(intent.then, behaviourDoc.commands ?? []);
      if (!ev || !cmd) return null;
      const policies = flowDoc.policies ?? [];
      if (policies.some((p) => p.on === ev.id && p.then === cmd.id)) return null; // already wired
      return () => {
        let n = policies.length + 1;
        let id = `policy_${n}`;
        while (policies.some((p) => p.id === id)) id = `policy_${++n}`;
        const pol = { id, name: `${ev.name} → ${cmd.name}`, on: ev.id, then: cmd.id, meta: { origin: "authored" } };
        patchActive({ domain: { ...flowDoc, policies: [...policies, pol] } });
      };
    }
    if (intent.kind === "addAttribute") {
      const agg = resolveNode(intent.entity, domainDoc.aggregates);
      if (!agg) return null;
      const have = new Set((agg.attributes ?? []).map((x) => normId(attrNameOf(x))));
      const add = intent.attrs.filter((x) => !have.has(normId(x.name)));
      if (!add.length) return null;
      return () => editAggregate({ ...agg, attributes: [...(agg.attributes ?? []), ...add] } as AggregateInput);
    }
    if (intent.kind === "addReference") {
      const agg = resolveNode(intent.entity, domainDoc.aggregates);
      const to = resolveNode(intent.to, domainDoc.aggregates);
      if (!agg || !to || (agg.references ?? []).includes(to.id)) return null;
      return () => editAggregate({ ...agg, references: [...(agg.references ?? []), to.id] } as AggregateInput);
    }
    if (intent.kind === "assignCapability") {
      // Resolve the refs against capabilities AND the layer's containers; apply only when EXACTLY one of
      // each lands (else it's ambiguous → fall back to manual, never wire the wrong pair).
      const containers = layer === "roles" ? rolesDoc.roles : layer === "agents" ? agentsDoc.agents : contextsDoc.contexts;
      const capIds = new Set(intent.refs.map((r) => resolveNode(r, activeDoc.capabilities)?.id).filter(Boolean));
      const contIds = new Set(intent.refs.map((r) => resolveNode(r, containers as { id: string; name: string }[])?.id).filter(Boolean));
      if (capIds.size !== 1 || contIds.size !== 1) return null;
      const capId = [...capIds][0]!;
      const contId = [...contIds][0]!;
      const cont = containers.find((c) => c.id === contId) as { capabilities?: string[] } | undefined;
      if ((cont?.capabilities ?? []).includes(capId)) return null; // already wired
      if (layer === "areas") return () => reassignCapabilityArea(capId, contId);
      if (layer === "roles") return () => patchActive({ roles: { ...rolesDoc, roles: rolesDoc.roles.map((r) => (r.id === contId ? { ...r, capabilities: [...(r.capabilities ?? []), capId], meta: { ...(r.meta ?? {}), origin: "authored" } } : r)) } });
      return () => patchActive({ agents: { ...agentsDoc, agents: agentsDoc.agents.map((a) => (a.id === contId ? { ...a, capabilities: [...(a.capabilities ?? []), capId], meta: { ...(a.meta ?? {}), origin: "authored" } } : a)) } });
    }
    if (intent.kind === "addWorkflowStep") {
      const wf = resolveNode(intent.workflow, workflowsDoc.workflows);
      if (!wf) return null;
      const cmdIds = intent.refs.map((r) => resolveNode(r, behaviourDoc.commands ?? [])?.id).filter(Boolean) as string[];
      const add = [...new Set(cmdIds)].filter((id) => !(wf.steps ?? []).includes(id));
      if (!add.length) return null;
      return () => patchActive({ workflows: { ...workflowsDoc, workflows: workflowsDoc.workflows.map((w) => (w.id === wf.id ? { ...w, steps: [...(w.steps ?? []), ...add], meta: { ...(w.meta ?? {}), origin: "authored" } } : w)) } });
    }
    return null;
  }

  // ---- Business-areas: generate + editing (SPEC-003; the model proposes, the human decides) ----
  async function generateAreas(): Promise<void> {
    setContextsBusy(true);
    setError(null);
    try {
      const res = await fetch(`${SERVICE_URL}/api/contexts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ capabilities: activeDoc, ...stageCfg("areas") }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      patchActive({ contexts: data.doc as ContextsDoc });
      applySpend(data);
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
        body: JSON.stringify({ domain: domainDoc, capabilities: activeDoc, ...stageCfg("behaviour") }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      // Fresh commands/events invalidate any prior reactions (they referenced old ids) → drop them.
      patchActive({ domain: { ...data.doc, policies: undefined } });
      applySpend(data);
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
        body: JSON.stringify({ domain: behaviourDoc, capabilities: activeDoc, ...stageCfg("automations") }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      patchActive({ domain: data.doc }); // merges policies onto the behaviour doc
      applySpend(data);
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
        body: JSON.stringify({ capabilities: activeDoc, ...stageCfg("roles") }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      patchActive({ roles: data.doc });
      applySpend(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRolesBusy(false);
    }
  }

  // ---- Semantic critic: the Review → Refine → Re-review → Clean loop, any layer (advisory) ----
  // A model override lets the auto loop feed a just-refined doc straight into the next review,
  // bypassing React's async state (the render-time docs would otherwise be stale mid-loop).
  // ---- Per-stage engine/model/effort ----
  // A global default (engine / globalModel / effort) with optional per-stage overrides. A stage can run on
  // a different PROVIDER, MODEL and EFFORT than the default — e.g. capabilities on Opus, entities on a cheap
  // gateway model in low effort. Each request threads its stage's {provider, model, effort}.
  const adaptive = active.adaptiveModel ?? true; // adaptive Anthropic per-stage defaults (on unless disabled)
  const stageOverride = (stage: string): { provider?: string; model?: string; effort?: string } => active.stages?.[stage] ?? {};
  const providerFor = (stage: string): string => {
    const o = stageOverride(stage).provider;
    if (o && catalog.some((p) => p.id === o)) return o;
    // Visual polish is a vision pass → Anthropic-only; default it there when Anthropic is configured.
    if (stage === "visual" && catalog.some((p) => p.id === "anthropic")) return "anthropic";
    return engine;
  };
  const modelFor = (stage: string): string => {
    const prov = providerFor(stage);
    const p = catalog.find((x) => x.id === prov) ?? engineProvider;
    const o = stageOverride(stage).model;
    if (o && (p.models.some((m) => m.id === o) || p.allowCustomModel)) return o;
    // Adaptive: on Anthropic with no override, pick the model by the layer's tier (Opus/Sonnet/Haiku).
    if (adaptive && prov === "anthropic") {
      const tierModel = ANTHROPIC_TIER_MODEL[stageTier(stage)];
      if (p.models.some((m) => m.id === tierModel)) return tierModel;
    }
    return prov === engine ? globalModel : p.defaultModel ?? p.models[0]?.id ?? globalModel;
  };
  // A stage's effort: its override, else the review preset (review), else the adaptive per-tier effort
  // on Anthropic, else the flat global effort.
  const effortFor = (stage: string, review = false): string => {
    const o = stageOverride(stage).effort;
    if (o) return o;
    if (review) return CRITIQUE_EFFORT[stage as LayerKind] ?? "high";
    if (adaptive && providerFor(stage) === "anthropic") return GEN_EFFORT_TIER[stageTier(stage)];
    return active.effort;
  };
  const critiqueEffortFor = (layer: LayerKind): string => effortFor(layer, true);
  // The full {model, effort, provider} a request should send for a stage. Spread into the body.
  const stageCfg = (stage: string, review = false): { model: string; effort: string; provider: string } => ({ model: modelFor(stage), effort: effortFor(stage, review), provider: providerFor(stage) });
  const supportsEffortFor = (stage: string): boolean => MODELS.find((m) => m.id === modelFor(stage))?.supportsEffort ?? true;

  // Home greeting: one warm plain-language summary of the business, generated once per project and cached
  // (invalidated when the narrative changes). Fired lazily on the home screen; on failure (e.g. no key on
  // the demo) it silently falls back to the description. Tried at most once per project per session.
  const summaryTried = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!showHome) return;
    const p = active;
    if (!p || p.homeSummary || !hasRealNarrative(p.narrative) || summaryTried.current.has(p.id)) return;
    summaryTried.current.add(p.id);
    void fetch(`${SERVICE_URL}/api/summary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ narrative: p.narrative, ...stageCfg("capabilities") }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { summary?: string; estCostUsd: number; sessionSpendUsd: number; usage: { input: number; output: number } } | null) => {
        if (data?.summary) { patchActive({ homeSummary: data.summary }); applySpend(data); }
      })
      .catch(() => {/* offline / no key → keep the description fallback */});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHome, active?.id, active?.homeSummary, active?.narrative]);
  // The engine default baked into the EXPORTED agents runtime (.env.example): the provider + model the
  // agents stage resolves to now, so an app built on a gateway ships pre-pointed at it. Native gateway ids
  // map through; anything else → the generic OpenAI-compatible path.
  const agentExportDefault = (): { provider: string; model: string } => {
    const prov = providerFor("agents");
    return { provider: ["anthropic", "openrouter", "omniroute"].includes(prov) ? prov : "openai-compatible", model: modelFor("agents") };
  };

  const reviewBody = (layer: LayerKind, ov: ModelOverride) => ({
    layer,
    capabilities: activeDoc,
    domain: ov.domain ?? flowDoc,
    contexts: ov.contexts ?? contextsDoc,
    roles: ov.roles ?? rolesDoc,
    workflows: ov.workflows ?? workflowsDoc,
    agents: ov.agents ?? agentsDoc,
    ...stageCfg(layer, true),
    // Concerns the human already accepted on this layer → the critic is told not to raise them again.
    accepted: (active.ignoredFindings ?? [])
      .filter((k) => k.startsWith(`ai|${layer}|`))
      .map((k) => k.split("|").slice(3).join("|"))
      .filter(Boolean),
  });

  // Provenance gate: a layer counts as "generated" only when its doc is materialized in the project
  // (`active.*`); otherwise the view is the live-mock placeholder. Reviewing a placeholder spends real
  // LLM budget critiquing deterministic filler, so the AI-review panel gates it. Mirrors the StageRail
  // glyph (mock vs ready) — see `layerStatus` below.
  function layerGenerated(k: LayerKind): boolean {
    switch (k) {
      case "capabilities": return Boolean(active.capabilities);
      case "areas": return Boolean(active.contexts);
      case "entities": return Boolean(active.domain);
      case "behaviour": return Boolean(active.domain?.commands?.length);
      case "automations": return Boolean(active.domain?.policies?.length);
      case "roles": return Boolean(active.roles);
      case "workflows": return Boolean(active.workflows);
      case "agents": return Boolean(active.agents);
      case "holistic": return Boolean(active.capabilities); // the cross-layer pass needs a real spine
      default: return true;
    }
  }

  // Review: ask the LLM (higher effort, server-side) to critique one layer. Returns the findings.
  async function reviewLayer(layer: LayerKind, ov: ModelOverride = {}): Promise<CritiqueFinding[]> {
    if (!layerGenerated(layer)) return []; // gated: never review placeholder (live-mock) content
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
      // Drop concerns the human has already accepted (matched fuzzily so a reworded re-raise stays down).
      const findings = ((data.findings ?? []) as CritiqueFinding[]).filter((f) => !isCritIgnored(layer, f));
      // Diff against the previous round for progress-vs-churn, and against all earlier rounds for
      // recurrence (an oscillating layer). Then append this round to the history and count it. First
      // review of a layer has no prior → no diff.
      const history = reviewHistoryRef.current[layer] ?? [];
      const prior = history[history.length - 1];
      const earlier = history.slice(0, -1).flat();
      setCritiqueDiff((d) => ({ ...d, [layer]: prior ? diffCritique(prior, findings, earlier) : undefined }));
      reviewHistoryRef.current[layer] = [...history, findings];
      setReviewCount((c) => ({ ...c, [layer]: (c[layer] ?? 0) + 1 }));
      setCritique((prev) => ({ ...prev, [layer]: findings }));
      setStaleReview((s) => { if (!s[layer]) return s; const n = { ...s }; delete n[layer]; return n; }); // reviewed → no longer "changed upstream"
      applySpend(data);
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
    const common = { ...stageCfg(layer), feedback: critiqueToFeedback(fs) };
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
      // Refined → re-review to confirm closure. This layer's regen also overwrote the layers below it
      // (see APPLY_RESETS_BELOW), so their prior findings are now stale → clear them too, honestly
      // matching the "resets N below" warning on the Apply button.
      const resetBelow = APPLY_RESETS_BELOW[layer] ?? [];
      // Downstream layers that had actually been reviewed (critique entry present) are now "changed
      // upstream" — flag them so they read as re-reviewable, not as never-touched. Never-reviewed ones
      // need no nudge (the user reaches them in the normal top-down flow).
      const nowStale = resetBelow.filter((d) => critique[d] !== undefined);
      setCritique((prev) => {
        const next = { ...prev, [layer]: undefined };
        for (const d of resetBelow) next[d] = undefined;
        return next;
      });
      setStaleReview((s) => {
        const n = { ...s };
        delete n[layer]; // the applied layer is fresh, not stale
        for (const d of nowStale) n[d] = true;
        return n;
      });
      applySpend(data);
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
  // Pricing helper for the whole-model run buttons: mid $/call at the model a layer runs on.
  const perCallCost = (modelId: string): number => {
    const m = MODELS.find((x) => x.id === modelId);
    return (EST_IN_TOKENS * (m?.inPerM ?? 2) + EST_OUT_TOKENS * (m?.outPerM ?? 10)) / 1_000_000;
  };

  // "Review all layers" — run every reviewer top-down, READ-ONLY (one review call per layer, no refine).
  // This is the plain "second opinion on the whole model" action and the panel's default. Auto-fix
  // (autoReview) additionally regenerates flagged layers, so it MUTATES the model; this never does.
  async function reviewAll(): Promise<void> {
    if (autoRunning) return;
    const genLayers = reviewLayers.filter((r) => r.generated);
    if (genLayers.length === 0) { window.alert(t("aiNothingToReview")); return; }
    const midCost = genLayers.reduce((s, r) => s + perCallCost(modelFor(r.kind)), 0);
    const lo = (midCost * 0.5).toFixed(2);
    const hi = (midCost * 1.5).toFixed(2);
    if (!window.confirm(t("reviewAllConfirm", { calls: genLayers.length, lo, hi }))) return;
    setAutoRunning(true);
    autoStopRef.current = false;
    setError(null);
    try {
      for (const row of genLayers) {
        if (autoStopRef.current) break;
        setAutoLayer(row.kind);
        await reviewLayer(row.kind);
      }
    } finally {
      setAutoRunning(false);
      setAutoLayer(null);
    }
  }

  async function autoReview(): Promise<void> {
    if (autoRunning) return;
    // Only real (generated) layers are reviewable — placeholders are gated. Nothing generated → nothing
    // to do (Auto would otherwise estimate 0 calls and silently no-op).
    const genLayers = reviewLayers.filter((r) => r.generated);
    if (genLayers.length === 0) { window.alert(t("aiNothingToReview")); return; }
    const MAX_REFINES = 2;
    // Estimate the worst case up front and get explicit consent — a full run is a burst of
    // higher-effort calls. Tier-aware: each stage is priced at the model it actually runs on
    // (Opus stages cost more than Sonnet/Haiku ones). Per layer: 1 review + up to 2 refine+re-review.
    let maxCalls = 0;
    let midCost = 0;
    for (const row of genLayers) {
      const refinable = row.kind !== "capabilities" && row.kind !== "holistic";
      const n = 1 + (refinable ? MAX_REFINES * 2 : 0); // worst case: initial review + (refine + re-review) × 2
      maxCalls += n;
      midCost += n * perCallCost(modelFor(row.kind));
    }
    const lo = (midCost * 0.5).toFixed(2);
    const hi = (midCost * 1.5).toFixed(2);
    if (!window.confirm(t("autoConfirm", { calls: maxCalls, lo, hi }))) return;
    setAutoRunning(true);
    autoStopRef.current = false;
    setError(null);
    try {
      let acc: ModelOverride = {};
      for (const row of genLayers) {
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
    .concat([{ kind: "holistic", label: t("holistic"), count: activeDoc.capabilities.length }])
    // Provenance: which rows are real (generated) vs. still the live-mock placeholder. The panel marks
    // placeholders and disables their Review action so no one pays to critique deterministic filler.
    .map((r) => ({ ...r, generated: layerGenerated(r.kind) }));

  // For the review panel's Apply button: applying entities/behaviour regenerates the layers below them
  // (they share the domain doc), so name those layers and count the open findings there that Apply will
  // reset. Null when Apply resets nothing below (areas/automations/roles/workflows/agents own their docs).
  const applyResetHint = (k: LayerKind): string | null => {
    const below = (APPLY_RESETS_BELOW[k] ?? []).filter((d) => reviewLayers.some((l) => l.kind === d));
    if (below.length === 0) return null;
    const layers = below.map((d) => reviewLayers.find((l) => l.kind === d)!.label).join(" + ");
    const count = below.reduce((n, d) => n + (critique[d]?.length ?? 0), 0);
    return count > 0 ? t("aiApplyResetsN", { layers, count }) : t("aiApplyResets", { layers });
  };

  // Whole-model review roll-up for Mission Control (Home). Only real (generated) layers are reviewable;
  // of those, how many have been reviewed at least once, and how many open concerns remain across them.
  // Excludes the holistic pass (a separate cross-cutting check, not a "layer") so this matches the
  // dashboard's own summary/gauge count.
  const reviewableLayers = reviewLayers.filter((r) => r.generated && r.kind !== "holistic");
  const reviewedLayerCount = reviewableLayers.filter((r) => critique[r.kind] !== undefined).length;
  const reviewConcernCount = reviewableLayers.reduce((n, r) => n + (critique[r.kind]?.filter((f) => f.severity === "concern").length ?? 0), 0);

  // SPEC-007/008: generate workflows (from behaviour) and agents (from capabilities) via the LLM.
  async function generateWorkflowsModel(): Promise<void> {
    setWorkflowsBusy(true); setError(null);
    try {
      const res = await fetch(`${SERVICE_URL}/api/workflows`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain: behaviourDoc, ...stageCfg("workflows") }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      patchActive({ workflows: data.doc });
      applySpend(data);
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
      const res = await fetch(`${SERVICE_URL}/api/orchestration`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workflows: workflowsDoc, domain: behaviourDoc, ...stageCfg("workflows") }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      patchActive({ workflows: data.workflows }); // modes folded onto the workflows (source of truth)
      setOrchestrationRationales(Object.fromEntries((data.doc?.decisions ?? []).map((d: { id: string; rationale: string }) => [d.id, d.rationale])));
      applySpend(data);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setOrchestrationBusy(false); }
  }
  async function generateAgentsModel(): Promise<void> {
    setAgentsBusy(true); setError(null);
    try {
      const res = await fetch(`${SERVICE_URL}/api/agents`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ capabilities: activeDoc, ...stageCfg("agents") }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      patchActive({ agents: data.doc });
      applySpend(data);
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
  // Switch to a project (mirrors the sidebar dropdown: switch + re-root the current stage).
  function openProject(id: string): void {
    setState((s) => ({ ...s, activeId: id }));
    navRoot(stage);
  }
  // All three take an explicit id so they work from the project manager (any project), not just the active one.
  function renameProject(id: string): void {
    const p = state.projects.find((x) => x.id === id);
    if (!p) return;
    setDialog({ kind: "input", title: t("rename"), label: t("renamePrompt"), initial: p.name, submitLabel: t("save"), onSubmit: (v) => {
      if (v.trim()) setState((s) => ({ ...s, projects: s.projects.map((x) => (x.id === id ? { ...x, name: v.trim(), updatedAt: Date.now() } : x)) }));
    } });
  }
  function editDescription(): void {
    setDialog({ kind: "input", title: t("descriptionHint"), label: t("descriptionPrompt"), initial: active.description ?? "", multiline: true, submitLabel: t("save"), onSubmit: (v) => patchActive({ description: v.trim() || undefined }) });
  }
  // Fork the WHOLE project (every layer) under a fresh id → "try a variant without touching the original".
  function duplicateProject(id: string): void {
    const src = state.projects.find((x) => x.id === id);
    if (!src) return;
    // A duplicate is always the user's own project — clear the "example (…)" marker so a forked demo
    // stops being a hidden catalog entry and shows in the manager as a normal project.
    const copy: Project = { ...src, id: uid(), name: `${src.name} ${t("copySuffix")}`, updatedAt: Date.now(), provider: isExampleProject(src) ? null : src.provider };
    setState((s) => ({ projects: [...s.projects, copy], activeId: copy.id }));
    setSelected(null);
    if (serverUp) void serverSaveProject(copy);
  }
  function deleteProject(id: string): void {
    if (state.projects.length <= 1) return;
    const p = state.projects.find((x) => x.id === id);
    if (!p) return;
    setDialog({ kind: "confirm", title: t("del"), message: `${t("deleteConfirm")} "${p.name}"`, confirmLabel: t("del"), danger: true, onConfirm: () => {
      setState((s) => {
        const remaining = s.projects.filter((x) => x.id !== id);
        return { projects: remaining, activeId: s.activeId === id ? remaining[0].id : s.activeId };
      });
      setSelected(null);
      if (serverUp) void serverDeleteProject(id);
    } });
  }

  // ---- The complete model document (recall + iterate + version) ----
  // Export the WHOLE model (every layer, execution decisions materialized) as one git-versionable
  // model.json; import one back as a new project. This is the single source of truth for the business.
  const modelFileRef = useRef<HTMLInputElement>(null);
  // Resolve a project's core layers exactly as the app does for the active one (stored ?? live mock),
  // so ANY project can be exported from the manager — not only the one currently open.
  function resolveCore(p: Project): ResolvedCore {
    const pdoc = parseNarrative(p.narrative);
    const caps = p.capabilities ?? mockGenerateCapabilities(pdoc);
    const domain = p.domain ?? mockGenerateDomain(caps);
    const behaviour = ((domain.commands?.length ?? 0) + (domain.events?.length ?? 0)) > 0 ? domain : mockGenerateEvents(domain);
    const flow = (behaviour.policies?.length ?? 0) > 0 ? behaviour : mockGeneratePolicies(behaviour);
    return {
      name: p.name, description: p.description, narrative: p.narrative,
      capabilities: caps,
      contexts: p.contexts ?? mockGroupContexts(caps),
      domain: flow,
      roles: p.roles ?? mockGenerateRoles(caps),
      workflows: p.workflows ?? mockGenerateWorkflows(behaviour),
      agents: p.agents ?? mockGenerateAgents(caps),
    };
  }
  // Export a project's whole model.json (every layer, execution decisions materialized). Any project,
  // not just the active one — the natural home for "export" now that management lives in the manager.
  function exportProject(id: string): void {
    const p = state.projects.find((x) => x.id === id);
    if (!p) return;
    const model = assembleModel(resolveCore(p), p, agentExportDefault());
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(p.name || "model").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.model.json`;
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
      const common = { ...stageCfg(enrichLayer === "entities" ? "entities" : "capabilities") };
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
      applySpend(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnrichWebBusy(false);
    }
  }


  // Resolve any artifact id (capability / area-node / entity / command / event / policy / role / agent)
  // to a display NAME — used for breadcrumb labels AND for the meaning-key of an ignored finding.
  const nameFor = (id: string): string => {
    if (id.startsWith("wf:")) { const w = workflowsDoc.workflows.find((x) => `wf:${x.id}` === id); if (w) return w.name || w.id; }
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
  // A policy has no meaningful name of its own — describe it by its hand-off (event → command) so a hint
  // reads "'Roll Presented For Sale → Discard Roll'" instead of "'pol_afcedb7e'".
  const policyLabel = (id: string): string => {
    const p = (flowDoc.policies ?? []).find((x) => x.id === id);
    if (!p) return id;
    if (p.name && p.name.trim() && p.name !== id && !/^pol[_-]/.test(p.name)) return p.name;
    const ev = p.on ? nameFor(p.on) : "", cmd = p.then ? nameFor(p.then) : "";
    return ev && cmd ? `${ev} → ${cmd}` : (p.name || id);
  };
  // Findings from the pure validators embed raw ids in quotes (e.g. 'pol_afcedb7e', 'prepared_roll').
  // Swap each quoted snake-id for its business name so the hint reads like a person wrote it.
  const humanizeMsg = (msg: string): string =>
    msg.replace(/'([a-z][a-z0-9_:]*)'/g, (m, id: string) => {
      const isPolicy = (flowDoc.policies ?? []).some((p) => p.id === id);
      const label = isPolicy ? policyLabel(id) : nameFor(id);
      return label && label !== id ? `'${label}'` : m;
    });

  // ---- Findings the human has chosen to IGNORE (acknowledged / can't-fix-yet) — excluded from badge
  // counts + lists. Keyed on the hint's MEANING (code + the NAMES of the artifacts it's about), not the
  // generated id, so an ignore survives a regenerate that reissues ids. Restorable. ----
  const ignored = useMemo(() => new Set(active.ignoredFindings ?? []), [active.ignoredFindings]);
  const detKey = (f: { code: string; subjects: string[] }): string => `${f.code}|${f.subjects.map(nameFor).slice().sort().join(",")}`;
  // AI-critique ignores are keyed `ai|<layer>|<target>|<message>` and MATCHED FUZZILY (by target node or
  // wording), so an accepted concern stays silenced even when the critic rewords it. detKey stays exact.
  const critKey = (layer: LayerKind, f: { target?: string; message: string }): string => `ai|${layer}|${f.target ?? ""}|${f.message}`;
  const ignoredCrit = useMemo(
    () => (active.ignoredFindings ?? []).filter((k) => k.startsWith("ai|")).map((key) => {
      const [, layer, target, ...rest] = key.split("|");
      return { key, layer: layer as LayerKind, target: target || undefined, message: rest.join("|") };
    }),
    [active.ignoredFindings],
  );
  const isCritIgnored = (layer: LayerKind, f: { target?: string; message: string }): boolean =>
    ignoredCrit.some((ic) => ic.layer === layer && concernsMatch(ic, f));
  const liveCount = (arr: { code: string; subjects: string[] }[]): number => arr.reduce((n, f) => n + (ignored.has(detKey(f)) ? 0 : 1), 0);
  // Worst non-ignored severity → the rail's health channel. blocker/major = error (red), minor = warn
  // (amber); null = clean. Mirrors liveCount's ignore filter, so a fully-acknowledged layer reads clean.
  const SEV_RANK: Record<string, number> = { blocker: 3, major: 2, minor: 1 };
  const layerHealth = (arr: { code: string; subjects: string[]; severity: string }[]): "warn" | "error" | null => {
    let worst = "";
    for (const f of arr) if (!ignored.has(detKey(f)) && (SEV_RANK[f.severity] ?? 0) > (SEV_RANK[worst] ?? 0)) worst = f.severity;
    return worst === "blocker" || worst === "major" ? "error" : worst === "minor" ? "warn" : null;
  };
  function ignoreFinding(key: string): void {
    if (ignored.has(key)) return;
    patchActive({ ignoredFindings: [...(active.ignoredFindings ?? []), key] });
  }
  function ignoreCritFinding(layer: LayerKind, f: CritiqueFinding): void {
    ignoreFinding(critKey(layer, f));
  }
  function restoreLayerIgnored(layer: LayerKind): void {
    const keys = ignoredCrit.filter((ic) => ic.layer === layer).map((ic) => ic.key);
    if (keys.length) restoreIgnored(keys);
  }
  function restoreIgnored(keys: string[]): void {
    const drop = new Set(keys);
    patchActive({ ignoredFindings: (active.ignoredFindings ?? []).filter((k) => !drop.has(k)) });
  }

  // ---- Stage pipeline (progressive disclosure) ----
  const layerStatus = (authored: unknown, live: number): "empty" | "mock" | "ready" => (authored ? "ready" : live > 0 ? "mock" : "empty");
  const stages: StageInfo[] = [
    { id: "narrative", label: t("narrative"), status: hasRealNarrative(text) ? "ready" : "empty", findings: liveCount(narrativeFindings), health: layerHealth(narrativeFindings) },
    { id: "capabilities", label: t("capabilities"), status: layerStatus(active.capabilities, activeDoc.capabilities.length), findings: liveCount(capFindings), health: layerHealth(capFindings) },
    { id: "areas", label: t("areas"), status: layerStatus(active.contexts, contextsDoc.contexts.length), findings: liveCount(contextFindings), health: layerHealth(contextFindings) },
    { id: "entities", label: t("entities"), status: layerStatus(active.domain, domainDoc.aggregates.length), findings: liveCount(domainFindings), health: layerHealth(domainFindings) },
    { id: "behaviour", label: t("behaviour"), status: layerStatus(active.domain?.commands?.length, (behaviourDoc.commands?.length ?? 0) + (behaviourDoc.events?.length ?? 0)), findings: liveCount(eventFindings), health: layerHealth(eventFindings) },
    { id: "automations", label: t("automations"), status: layerStatus(active.domain?.policies?.length, flowDoc.policies?.length ?? 0), findings: liveCount(policyFindings), health: layerHealth(policyFindings) },
    { id: "roles", label: t("roles"), status: layerStatus(active.roles, rolesDoc.roles.length), findings: liveCount(roleFindings), health: layerHealth(roleFindings) },
    { id: "workflows", label: t("workflows"), status: layerStatus(active.workflows, workflowsDoc.workflows.length), findings: liveCount(workflowFindings), health: layerHealth(workflowFindings) },
    { id: "agents", label: t("agents"), status: layerStatus(active.agents, agentsDoc.agents.length), findings: liveCount(agentFindings), health: layerHealth(agentFindings) },
    { id: "code", label: t("viewCode"), status: "ready", findings: 0, health: null },
  ];
  // ── Regeneration guard ─────────────────────────────────────────────────────────────────────────
  // A Generate replaces the whole layer wholesale, discarding hand-made fixes (surgical fixes + entity
  // edits carry meta.origin="authored"). Those live in model.json — the durable source of truth — but the
  // narrative doesn't hold them, so a top-down regenerate loses them. Warn before that happens.
  const isAuthored = (x: { meta?: { origin?: string } }): boolean => x.meta?.origin === "authored";
  const authoredAggN = domainDoc.aggregates.filter(isAuthored).length;
  const authoredPolN = (flowDoc.policies ?? []).filter(isAuthored).length;
  const authoredCtxN = (active.contexts?.contexts ?? []).filter(isAuthored).length;
  const authoredRoleN = (active.roles?.roles ?? []).filter(isAuthored).length;
  const authoredWfN = (active.workflows?.workflows ?? []).filter(isAuthored).length;
  const authoredAgentN = (active.agents?.agents ?? []).filter(isAuthored).length;
  function atRiskCount(stage: StageId): number {
    switch (stage) {
      case "capabilities": // regenerating capabilities resets every downstream layer
        return authoredAggN + authoredPolN + authoredCtxN + authoredRoleN + authoredWfN + authoredAgentN;
      case "entities": return authoredAggN + authoredPolN; // entities regen also drops behaviour + automations
      case "behaviour":
      case "automations": return authoredPolN;
      case "areas": return authoredCtxN;
      case "roles": return authoredRoleN;
      case "workflows": return authoredWfN;
      case "agents": return authoredAgentN;
      default: return 0;
    }
  }
  function guardRegen(stage: StageId, proceed: () => void): void {
    const n = atRiskCount(stage);
    if (n <= 0) { proceed(); return; }
    setDialog({
      kind: "confirm", title: t("regenGuardTitle"), message: t("regenGuardMsg", { count: n }),
      confirmLabel: t("regenGuardConfirm"), danger: true, onConfirm: proceed,
    });
  }

  // Tag the version this generate produces (SPEC-011 M5), e.g. "Generated: Behaviour".
  const genSave = (k: StageId): string => `${t("versionAutoGenerated")}: ${t(k)}`;
  const gen = (stage: StageId, fn: () => void) => () => guardRegen(stage, () => { labelNextSave(genSave(stage)); fn(); });
  const stageGen: Partial<Record<StageId, { run: () => void; busy: boolean; label: string }>> = {
    capabilities: { run: gen("capabilities", () => void generate()), busy, label: t("generateBtn") },
    areas: { run: gen("areas", () => void generateAreas()), busy: contextsBusy, label: t("genAreas") },
    entities: { run: gen("entities", () => void generateDomainModel()), busy: domainBusy, label: t("genEntities") },
    behaviour: { run: gen("behaviour", () => void generateBehaviour()), busy: behaviourBusy, label: t("genBehaviour") },
    automations: { run: gen("automations", () => void generatePoliciesModel()), busy: policiesBusy, label: t("genAutomations") },
    roles: { run: gen("roles", () => void generateRolesModel()), busy: rolesBusy, label: t("genRoles") },
    workflows: { run: gen("workflows", () => void generateWorkflowsModel()), busy: workflowsBusy, label: t("genWorkflows") },
    agents: { run: gen("agents", () => void generateAgentsModel()), busy: agentsBusy, label: t("genAgents") },
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
  const hasDetail = !!(selectedArea || selectedAggregate || selectedCap || selectedWorkflow);

  return (
    <div className={`app${sidebarOpen ? "" : " sidebar-collapsed"}`}>
      {import.meta.env.VITE_PUBLIC_DEMO && (
        <div className="demo-banner">
          🔥 <strong>Public demo</strong> — real AI generation is disabled here (no key). Explore the example
          businesses, walk every stage, and export the code — then{" "}
          <a href="https://github.com/ziffr/kiln" target="_blank" rel="noreferrer">run your own Kiln</a> with
          your own Anthropic key.
        </div>
      )}
      {studioLocked && (
        <InputDialog title={t("studioLockTitle")} label={t("studioLockLabel")} placeholder={t("studioLockPlaceholder")} password
          submitLabel={t("save")} cancelLabel={t("cancel")}
          onSubmit={(v) => { if (v.trim()) localStorage.setItem(STUDIO_TOKEN_KEY, v.trim()); }}
          onClose={() => setStudioLocked(false)} />
      )}
      {showExamples && <ExamplesModal onPick={pickExample} onClose={() => setShowExamples(false)} t={t} />}
      {showProjects && (
        <ProjectsModal
          projects={state.projects}
          activeId={active.id}
          locale={i18n.language}
          serverUp={serverUp}
          onOpen={openProject}
          onNew={() => { setShowProjects(false); addProject(); }}
          onAddExample={() => { setShowProjects(false); setShowExamples(true); }}
          onImport={() => modelFileRef.current?.click()}
          onRename={renameProject}
          onDuplicate={duplicateProject}
          onExport={exportProject}
          onHistory={(id) => { openProject(id); setShowProjects(false); setShowVersions(true); }}
          onDelete={deleteProject}
          onClose={() => setShowProjects(false)}
          t={t}
        />
      )}
      {/* Hidden file input for "Import" — lives at the app root (not the sidebar) so the manager's
          Import action can trigger it; importModel adds the parsed model.json as a new project. */}
      {(
        <input ref={modelFileRef} type="file" accept="application/json,.json" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void importModel(f); e.target.value = ""; }} />
      )}
      {showVersions && (
        <VersionsModal
          projectId={active.id}
          onSaveVersion={async (label) => { await serverSaveProject(active, label, true); }}
          onRestored={(p) => {
            // Replace the active project with the restored content; reset to a clean root view.
            setState((s) => ({ ...s, projects: s.projects.map((x) => (x.id === p.id ? p : x)) }));
            navRoot("capabilities");
          }}
          onClose={() => setShowVersions(false)}
          t={t}
        />
      )}
      {showSettings && (
        <SettingsModal
          providers={catalog.map((p) => ({ id: p.id, label: p.label, note: p.note, allowCustomModel: p.allowCustomModel, models: p.models.map((m) => ({ id: m.id, label: m.label, supportsEffort: m.supportsEffort })) }))}
          efforts={EFFORTS}
          defaultEngine={engine}
          defaultModel={globalModel}
          defaultEffort={active.effort}
          adaptive={adaptive}
          onSetAdaptive={(v) => patchActive({ adaptiveModel: v })}
          docsUrl="https://docs.kilnstudio.app/reference/choosing-an-engine"
          stages={[...reviewLayers.map((r) => ({ key: r.kind as string, label: r.label, description: t(`stageDesc_${r.kind}`) })),
            { key: "polish", label: t("polishLayout"), description: t("stageDesc_polish") },
            { key: "visual", label: t("visualReview"), description: t("stageDesc_visual"), lockProvider: "anthropic" }]}
          overrides={active.stages ?? {}}
          resolvedFor={(key) => stageCfg(key)}
          onSetDefault={(field, value) => {
            if (field === "provider") { const p = catalog.find((x) => x.id === value) ?? engineProvider; patchActive({ engine: value, model: p.defaultModel }); }
            else if (field === "model") patchActive({ model: value });
            else patchActive({ effort: value });
          }}
          onSetStage={(key, field, value) => {
            const cur = { ...(active.stages ?? {}) };
            const row: { provider?: string; model?: string; effort?: string } = { ...(cur[key] ?? {}) };
            if (value === undefined || value === "") delete row[field];
            else { row[field] = value; if (field === "provider") delete row.model; } // model belongs to the old provider → clear it
            if (Object.keys(row).length) cur[key] = row; else delete cur[key];
            patchActive({ stages: cur });
          }}
          onReset={() => patchActive({ stages: {} })}
          onClose={() => setShowSettings(false)}
          binding={active.binding}
          onBindingChange={(b) => patchActive({ binding: b })}
          language={i18n.language}
          languages={["de", "en"]}
          onSetLanguage={(lng) => void i18n.changeLanguage(lng)}
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
                staleReview={staleReview}
                diffs={critiqueDiff}
                reviewCount={reviewCount}
                busy={reviewBusy}
                refinable={(k) => k !== "capabilities" && k !== "holistic"}
                effortFor={(k) => (supportsEffortFor(k) ? critiqueEffortFor(k) : "—")}
                modelLabelFor={(k) => MODELS.find((m) => m.id === modelFor(k))?.label ?? modelFor(k)}
                showModel={Object.keys(active.stages ?? {}).length > 0}
                onReview={(k) => void reviewLayer(k)}
                onApply={(k, fs) => refineLayer(k, fs).then((r) => r !== null)}
                applyResetHint={applyResetHint}
                onSelect={(f) => { selectFinding(f); setShowReview(false); }}
                canFix={(k, f) => resolveFix(k, f) !== null}
                onFix={(k, f) => {
                  const apply = resolveFix(k, f);
                  if (!apply) return;
                  apply();
                  // Fixed for real (the model changed) → drop it from the list; a re-review confirms.
                  setCritique((c) => ({ ...c, [k]: (c[k] ?? []).filter((x) => x.id !== f.id) }));
                }}
                onIgnore={(k, f) => {
                  ignoreCritFinding(k, f);
                  // Remove it from the current list right away so accepting feels immediate; it also
                  // won't return on the next review (filtered client-side + the critic is told).
                  setCritique((c) => ({ ...c, [k]: (c[k] ?? []).filter((x) => x.id !== f.id) }));
                }}
                ignoredCount={(k) => ignoredCrit.filter((ic) => ic.layer === k).length}
                onRestoreIgnored={(k) => restoreLayerIgnored(k)}
                onSettings={() => { setShowReview(false); setShowSettings(true); }}
                autoRunning={autoRunning}
                autoLayer={autoLayer}
                onReviewAll={() => void reviewAll()}
                onAuto={() => void autoReview()}
                onStop={() => { autoStopRef.current = true; }}
                t={t}
              />
            </div>
          </div>
        </div>
      )}
      <div className="shell">
      {/* Tap-to-close backdrop for the mobile off-canvas sidebar (hidden on desktop via CSS). */}
      <button className="sidebar-backdrop" aria-label={t("close")} onClick={() => setSidebarOpen(false)} />
      <aside className="side">
        <button className="side-team" onClick={() => setShowHome(true)} title={t("homeOpen")} aria-label={t("homeOpen")}>
          <div className="side-mark"><Icon name="flame" size={17} /></div>
          <div className="side-team-name">
            <div className="side-title">{t("appTitle")}</div>
            <div className="side-sub muted">{t("brandTagline")}</div>
          </div>
        </button>

        {/* Project identity + switcher in one control. It sits in the old dropdown's slot and keeps the
            chevron, so it reads as "the project selector" — but it opens the manager, where switching and
            every project action (new/rename/duplicate/delete/history/examples/import/export) now live. */}
        <div className="side-project">
          <button className="project-switch" onClick={() => setShowProjects(true)} title={t("projectsSwitchHint")} aria-label={t("projectsOpen")} aria-haspopup="dialog">
            <Icon name="folder" size={15} className="project-switch-folder" />
            <span className="project-switch-name">{active.name}</span>
            <Icon name="chevronDown" size={16} className="project-switch-caret" />
          </button>
          <button className="project-desc" onClick={editDescription} title={t("descriptionHint")}>
            {active.description || <span className="muted">+ {t("addDescription")}</span>}
          </button>
        </div>

        <StageRail stages={stages} active={showHome ? ("" as StageId) : stage} nextStep={stages.find((s) => s.id !== "code" && s.status !== "ready")?.id} onSelect={(s) => navRoot(s)} t={t} />

        <div className="side-foot">
          <a className="side-foot-btn" href={DOCS_URL} target="_blank" rel="noreferrer"><Icon name="book" size={15} /> {t("docsOpen")}</a>
          <button className="side-foot-btn" onClick={() => setShowSettings(true)}><Icon name="settings" size={15} /> {t("settingsOpen")}</button>
          {/* Session usage (estimated AI spend this page-session — same figures as the Home usage line)
              + build meta. The old storage-mode text was unclear; that signal survives as the small status
              dot (green = projects saved on the server, grey = this browser only — see the tooltip). */}
          <div className="side-usage" title={t("usageHint")}>
            <div className="side-usage-figs">
              <span className="side-usage-tokens">{sessionTokens.toLocaleString(i18n.language)}<span className="side-usage-unit"> {t("usageTokens")}</span></span>
              <span className="side-usage-cost">${(spend?.sessionSpendUsd ?? 0).toFixed(2)}</span>
            </div>
            <div className="side-usage-meta muted">
              <span className={`side-store-dot${serverUp ? " on" : ""}`} title={t(serverUp ? "storeServerHint" : "storeLocalHint")} />
              <span>{t("usageSession")}</span>
              <span className="side-version" title={t("versionHint")}>v{__APP_VERSION__}<span className="side-version-sha"> · {__APP_COMMIT__}</span></span>
            </div>
          </div>
        </div>
      </aside>

      <div className="inset">
        {showHome ? (
          <Home
            stages={stages}
            projectName={active.name}
            description={active.description || ""}
            tokens={sessionTokens}
            costUsd={spend?.sessionSpendUsd ?? 0}
            version={__APP_VERSION__}
            onStart={() => navRoot("narrative")}
            onExample={() => { setShowHome(false); setShowExamples(true); }}
            onExportModel={() => exportProject(active.id)}
            onProjects={() => setShowProjects(true)}
            onSettings={() => setShowSettings(true)}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            onPickStage={(s) => navRoot(s)}
            onReviewModel={() => setShowReview(true)}
            reviewTotal={reviewableLayers.length}
            reviewReviewed={reviewedLayerCount}
            reviewConcerns={reviewConcernCount}
            t={t}
          />
        ) : (
        <>
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
        </header>

        <div className={`inset-body${hasDetail ? " has-detail" : ""}`}>
        <main className="stage-main">
          <div className="stage-head">
            <div className="stage-title">
              <h2>{activeStage.label}</h2>
              <p className="stage-desc muted">{t(`stageDesc_${stage}`)}</p>
            </div>
            {/* Grouped by intent: manual "add" (structural) and "enrich" (AI-adds) on the left, then
                the primary "generate", then a stage-scoped "AI review" of THIS layer (feeding the inline
                issues panel below). The whole-model review dashboard now lives on Home, not a global
                header button. Auto is folded into Enrich (Apply = apply all). */}
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
              {REVIEW_KIND[stage] && (() => {
                const lk = REVIEW_KIND[stage]!;
                const gen = layerGenerated(lk);
                const busy = reviewBusy === lk;
                const reviewed = critique[lk] !== undefined;
                return (
                  <button
                    className="btn ghost"
                    disabled={!gen || busy}
                    title={gen ? t("aiReviewLayerHint") : t("aiNotGeneratedHint", { layer: activeStage.label })}
                    onClick={() => { setShowIssues(true); void reviewLayer(lk); }}
                  >
                    <Icon name="sparkles" />{busy ? t("aiReviewBusy") : reviewed ? t("aiReviewAgain") : t("aiReviewTitle")}
                  </button>
                );
              })()}
            </div>
          </div>

          {/* "What do I do on this screen?" — the non-technical owner's first question. Dismissible. */}
          {!["narrative", "code"].includes(stage) && (
            <StageGuide
              stage={stage}
              hasGenerate={!!stageGen[stage]}
              hasEnrich={(["entities", "capabilities", "roles", "agents"] as string[]).includes(stage)}
              t={t}
            />
          )}

          {error && (
            <div className="err-banner" role="alert">
              <Icon name="alert" size={16} />
              <div className="err-banner-text">
                <code>{error}</code>
                <div className="err-banner-hint">
                  {/(not a valid model|for model "|timed out|too slow|could not be reached|invalid model)/i.test(error) ? t("modelErrorHint") : t("serviceHint")}
                </div>
              </div>
            </div>
          )}

          {/* Findings live at the TOP (below the header) so they're visible on entry regardless of how
              tall the diagram is; a collapsible, height-capped panel keeps a long list from dominating. */}
          {(() => {
            const raw = stageFindings[stage] ?? [];
            const det = raw.filter((f) => !ignored.has(detKey(f)));
            const layerKind = REVIEW_KIND[stage];
            const critRaw = layerKind ? critique[layerKind] : undefined;
            const crit = layerKind ? critRaw?.filter((f) => !isCritIgnored(layerKind, f)) : critRaw;
            const ignoredHere = [
              ...raw.filter((f) => ignored.has(detKey(f))).map(detKey),
              ...(layerKind ? ignoredCrit.filter((ic) => ic.layer === layerKind).map((ic) => ic.key) : []),
            ];
            const total = det.length + (crit?.length ?? 0);
            if (total === 0 && !critRaw && ignoredHere.length === 0) return null;
            return (
              <div className="stage-issues">
                <button className="stage-issues-head" onClick={() => setShowIssues((v) => !v)} aria-expanded={showIssues}>
                  <Icon name={showIssues ? "chevronDown" : "chevronRight"} size={14} />
                  <Icon name="alert" size={13} className="si-alert" />
                  <span>{t("issuesCount", { count: total })}</span>
                </button>
                {showIssues && (
                  <div className="stage-issues-body">
                    {total > 0 && <p className="si-help muted">{t("issuesHelp")}</p>}
                    {det.length > 0 && (
                      <ul className="findings cap-findings">
                        {det.map((f) => {
                          const subj = f.subjects.find(isArtifact);
                          const fix = findingFix(f.code, i18n.language) ?? t("findingFixFallback");
                          const removablePolicy = subj && (active.domain?.policies ?? []).some((p) => p.id === subj) ? subj : undefined;
                          return (
                            <li key={f.id} className={subj ? "clickable" : ""} onClick={() => subj && navTo(stage, subj)} onMouseEnter={() => subj && setHovered(subj)} onMouseLeave={() => setHovered(null)} title={`${f.code}${subj ? " · " + t("findingGoHint") : ""}`}>
                              <span className="fi-text">
                                <span className="fi-msg"><span className={`sev-pill sev-${f.severity}`}>{t(`sev_${f.severity}`)}</span> {humanizeMsg(f.message)}</span>
                                <span className="fi-fix">
                                  {fix}
                                  {removablePolicy && <button className="fi-action" onClick={(e) => { e.stopPropagation(); deletePolicy(removablePolicy); }}><Icon name="trash" size={11} /> {t("removeAutomation")}</button>}
                                </span>
                              </span>
                              <button className="fi-dismiss" title={t("ignore")} aria-label={t("ignore")} onClick={(e) => { e.stopPropagation(); ignoreFinding(detKey(f)); }}><Icon name="x" size={13} /></button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {crit && (
                      <ul className="findings cap-findings critique-inline">
                        <li className="findings-head muted"><Icon name="sparkles" size={13} /> {t("aiReviewTitle")}</li>
                        {crit.length === 0 && <li className="muted">{t("aiReviewOk")}</li>}
                        {crit.map((f) => (
                          <li key={f.id} className={f.target ? "clickable" : ""} onClick={() => f.target && selectFinding(f)} onMouseEnter={() => f.target && setHovered(findingTargetId(f))} onMouseLeave={() => setHovered(null)} title={f.target ? t("findingGoHint") : undefined}>
                            <span className="fi-text"><code className={f.severity === "concern" ? "major" : "minor"}>{t(`sev_${f.severity}`)}</code> {humanizeMsg(f.message)}{f.suggestion ? ` → ${f.suggestion}` : ""}</span>
                            {layerKind && <button className="fi-dismiss" title={t("ignore")} aria-label={t("ignore")} onClick={(e) => { e.stopPropagation(); ignoreCritFinding(layerKind, f); }}><Icon name="x" size={13} /></button>}
                          </li>
                        ))}
                      </ul>
                    )}
                    {ignoredHere.length > 0 && (
                      <button className="si-restore" onClick={() => restoreIgnored(ignoredHere)}>
                        <Icon name="refresh" size={12} /> {t("restoreIgnored", { count: ignoredHere.length })}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          <div className="stage-body">
            {stage === "narrative" && (
              <div className="narrative-stage">
                <NarrativeInput
                  key={active.id}
                  narrative={text}
                  onNarrative={setNarrative}
                  summary={active.homeSummary || active.description || ""}
                  openQuestions={active.openQuestions ?? []}
                  onUnderstood={(r) => { if (r.narrative) setNarrative(r.narrative); patchActive({ homeSummary: r.summary, openQuestions: r.openQuestions }); }}
                  onSpend={applySpend}
                  model={globalModel}
                  effort={active.effort}
                  provider={engine}
                  config={active.coachConfig ?? {}}
                  onConfig={(c) => patchActive({ coachConfig: c })}
                  transcript={active.coachTranscript ?? []}
                  onTranscript={(tr) => patchActive({ coachTranscript: tr })}
                  lang={i18n.language}
                />
                {(flowDoc.policies?.length ?? 0) > 0 && text.trim() && (
                  <div className="narrative-sync">
                    <button className="narrative-sync-btn" onClick={() => void syncNarrativeModel()} disabled={narrativeSyncBusy} title={t("narrativeSyncHint")}>
                      <Icon name="refresh" size={14} /> {narrativeSyncBusy ? t("narrativeSyncBusy") : t("narrativeSyncBtn")}
                    </button>
                    <span className="muted">{t("narrativeSyncHint")}</span>
                  </div>
                )}
                {/* The extracted-sections preview appears only once there's a real description to reflect —
                    empty boxes on a blank narrative are noise (understanding is built, not pre-drawn). */}
                {hasRealNarrative(text) && (
                  <div className="lists narrative-summary">
                    <div><h3>{t("outcomes")}</h3><ul>{businessOutcomes(doc).map((o) => <li key={o}>{o}</li>)}</ul></div>
                    <div><h3>{t("activities")}</h3><ul>{coreActivities(doc).map((a) => <li key={a}>{a}</li>)}</ul></div>
                    <div><h3>{t("customers")}</h3><ul>{customers(doc).map((c) => <li key={c}>{c}</li>)}</ul></div>
                  </div>
                )}
              </div>
            )}
            {stage === "capabilities" && <div className="map-wrap"><CapabilityMap ir={ir} areaOf={new Map()} selectedId={highlightId} onSelect={(id) => navTo("capabilities", id)} /></div>}
            {stage === "areas" && <AreaDiagram contexts={contextsDoc} caps={activeDoc} colors={AREA_COLORS} onSelectArea={(id) => navTo("areas", contextNodeId(id))} onSelectCap={(id) => navTo("capabilities", id)} t={t} />}
            {stage === "entities" && <EntityDiagram domain={domainDoc} caps={activeDoc} selectedId={highlightId} onSelect={(id) => navTo("entities", id)} />}
            {stage === "behaviour" && <BehaviourView domain={behaviourDoc} highlight={selectedAggregate?.id} highlightId={highlightId} t={t} />}
            {stage === "automations" && <AutomationsView domain={flowDoc} highlight={selectedAggregate?.id} highlightId={highlightId} t={t} />}
            {stage === "roles" && <RolesMatrix roles={rolesDoc} caps={activeDoc} highlightCap={hovered ?? selectedAggregate?.owner ?? selected} highlightId={highlightId} t={t} />}
            {stage === "workflows" && <WorkflowsView workflows={workflowsDoc} domain={behaviourDoc} t={t} onSetMode={setWorkflowMode} onSetService={setWorkflowService} onBindStep={setWorkflowStepBinding} onClassify={classifyOrchestration} classifyBusy={orchestrationBusy} rationales={orchestrationRationales} services={serviceOptions} selectedId={selected} onSelectWorkflow={(id) => navTo("workflows", `wf:${id}`)} onSelectStep={(cmdId) => navTo("behaviour", cmdId)} />}
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
                  const res = await fetch(`${SERVICE_URL}/api/app-logic`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ capabilities: activeDoc, domain: flowDoc, contexts: contextsDoc, feedback, ...stageCfg("behaviour") }) });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                  applySpend(data);
                  return data as { handlers: Record<string, string>; written: number; skipped: number };
                }}
                requestAppComponents={async () => {
                  const res = await fetch(`${SERVICE_URL}/api/app-components`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ capabilities: activeDoc, domain: flowDoc, contexts: contextsDoc, ...stageCfg("entities") }) });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                  applySpend(data);
                  return data as { views: Record<string, unknown>; written: number; skipped: number };
                }}
                requestVerify={async (files) => {
                  const res = await fetch(`${SERVICE_URL}/api/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files }) });
                  return await res.json();
                }}
                requestRun={serverUp ? async (files, views) => {
                  const res = await fetch(`${SERVICE_URL}/api/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files, views }) });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                  return { uiUrl: data.uiUrl as string, id: data.id as string };
                } : undefined}
                requestPolishUi={async (views) => {
                  const res = await fetch(`${SERVICE_URL}/api/polish-ui`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ capabilities: activeDoc, domain: flowDoc, contexts: contextsDoc, views, ...stageCfg("polish") }) });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                  applySpend(data);
                  return { views: data.views ?? {}, improvements: data.improvements ?? {} };
                }}
                requestPolishVisual={serverUp ? async (views) => {
                  const res = await fetch(`${SERVICE_URL}/api/polish-visual`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ capabilities: activeDoc, domain: flowDoc, contexts: contextsDoc, roles: rolesDoc, views, model: modelFor("visual"), effort: effortFor("visual") }) });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                  if (data.unavailable) return { views: {}, improvements: {}, unavailable: true, error: data.error };
                  applySpend(data);
                  return { views: data.views ?? {}, improvements: data.improvements ?? {} };
                } : undefined}
                requestCodeReview={async (handlerCode) => {
                  const res = await fetch(`${SERVICE_URL}/api/code-review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ capabilities: activeDoc, domain: flowDoc, contexts: contextsDoc, roles: rolesDoc, handlerCode, model: modelFor("behaviour"), provider: providerFor("behaviour") }) });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                  applySpend(data);
                  return data.findings ?? [];
                }}
                buildModel={() =>
                  assembleModel(
                    { name: active.name, description: active.description, narrative: text, capabilities: activeDoc, contexts: contextsDoc, domain: flowDoc, roles: rolesDoc, workflows: workflowsDoc, agents: agentsDoc },
                    active,
                    agentExportDefault(),
                  )
                }
                onClose={() => navTo("capabilities", null)}
              />
            )}
          </div>

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
            ) : selectedWorkflow ? (
              <WorkflowDetail workflow={selectedWorkflow} domain={behaviourDoc} rationale={orchestrationRationales?.[selectedWorkflow.id]} services={serviceOptions} t={t} onSelectStep={(cmdId) => navTo("behaviour", cmdId)} onClose={() => navTo(stage, null)} />
            ) : (
              <NodeDetail
                doc={activeDoc}
                aggregates={domainDoc.aggregates}
                commands={behaviourDoc.commands ?? []}
                events={behaviourDoc.events ?? []}
                policies={flowDoc.policies ?? []}
                capRoles={rolesForCap(selected)}
                roles={rolesDoc.roles.map((r) => ({ id: r.id, name: r.name || r.id }))}
                areas={contextsDoc.contexts.map((c) => ({ id: c.id, name: c.name }))}
                capAreaId={areaOf.get(selected)?.id}
                onReassignArea={reassignCapabilityArea}
                onNavigate={(s) => navTo(s, null)}
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
        </>
        )}
      </div>
      </div>
      {/* setDialog-driven prompts render LAST so they stack above any open modal (e.g. rename/delete
          launched from inside the project manager) — same .modal-overlay z-index, later DOM wins. */}
      {dialog?.kind === "input" && (
        <InputDialog title={dialog.title} label={dialog.label} initial={dialog.initial} multiline={dialog.multiline}
          submitLabel={dialog.submitLabel} cancelLabel={t("cancel")} onSubmit={dialog.onSubmit} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "confirm" && (
        <ConfirmDialog title={dialog.title} message={dialog.message} confirmLabel={dialog.confirmLabel} cancelLabel={t("cancel")}
          danger={dialog.danger} onConfirm={dialog.onConfirm} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
