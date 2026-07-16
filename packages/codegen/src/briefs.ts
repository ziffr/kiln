/**
 * briefs — the COMPLETION-BRIEF projector (Phase 1 of the "skeleton → completed" story).
 *
 * The exported system is a scaffold: real structure (schema, routes, columns, wiring) with the actual
 * business logic STUBBED. `TODO.md` lists the stubs; this module gives each command stub a grounded,
 * per-element **brief** so a downstream human or coding agent can complete it WITHOUT this session's
 * context. It is the honest form of "generate pseudo-code": we never invent control flow the model
 * doesn't contain — we project exactly what the IR knows and label the boundary between what is LOCKED
 * (derived, don't hand-edit) and what is yours to DECIDE (not in the model).
 *
 * Three tiers, always kept visible:
 *   1. LOCKED   — input fields, triggers, emitted events, authorized roles, delegation (all derived,
 *                 each line tagged with its provenance: the policy / event / role / binding it came from).
 *   2. FRAME    — the handler shape the runtime guarantees around your body.
 *   3. DECIDE   — the genuine business logic the model cannot contain (guards, the state change, side
 *                 effects, idempotency) — emitted as an explicit checklist, never as confident pseudo-code.
 *
 * PURE + isomorphic (invariant #4): NO node:*, string assembly over the model only.
 */
import { slug } from "@kiln/ir";
import { attributeSpecs, type DomainDoc, type RolesDoc, type WorkflowsDoc } from "@kiln/compiler";
import type { ResolvedElement } from "./targets.ts";
import type { ExternalServicesDoc } from "./services.ts";

/** A generated brief for one command: where it lands + the markdown body. */
export interface CommandBrief {
  id: string;
  name: string;
  /** relative path the exporter writes it to, e.g. `briefs/qualify_lead.md`. */
  path: string;
  markdown: string;
}

/** Optional context that grounds the brief further (all derived, all optional). */
export interface BriefContext {
  /** the binding resolution — used to say which engine a command's `operate` lands on. */
  resolved?: ResolvedElement[];
  roles?: RolesDoc;
  workflows?: WorkflowsDoc;
  services?: ExternalServicesDoc;
  /** app-level placement note per engine (SPEC-012) — "runs on Postgres (managed, DATABASE_URL)". */
  placementNote?: Record<string, string>;
}

/** Human-readable engine name for the "Runs on" line (a small local map — no dependency on targets' catalog). */
const ENGINE_LABEL: Record<string, string> = {
  node: "the generated spine (node)",
  postgres: "PostgreSQL",
  sqlite: "SQLite",
  n8n: "n8n",
  odoo: "Odoo",
  shadcn: "shadcn/ui",
};
const engineLabel = (id: string): string => ENGINE_LABEL[id] ?? id;

/**
 * Build a completion brief for every command in the model. Returns one `CommandBrief` per command,
 * each grounded in the IR with LOCKED/FRAME/DECIDE tiers. Deterministic: same model → same bytes.
 */
export function commandBriefs(domain: DomainDoc, ctx: BriefContext = {}): CommandBrief[] {
  const commands = domain.commands ?? [];
  if (commands.length === 0) return [];

  const aggById = new Map(domain.aggregates.map((a) => [a.id, a]));
  const evById = new Map((domain.events ?? []).map((e) => [e.id, e]));
  const policies = domain.policies ?? [];
  const workflows = ctx.workflows?.workflows ?? [];
  const roles = ctx.roles?.roles ?? [];
  const svcById = new Map((ctx.services?.services ?? []).map((s) => [s.id, s]));
  const operateEngineOf = new Map(
    (ctx.resolved ?? []).filter((r) => r.kind === "command").map((r) => [r.id, r.engineId]),
  );

  return commands.map((c) => {
    const agg = aggById.get(c.aggregate);
    const fields = agg ? attributeSpecs(agg) : [];
    const engineId = operateEngineOf.get(c.id) ?? "node";
    const runsOn = ctx.placementNote?.[engineId] ?? engineLabel(engineId);

    // ── LOCKED (derived) ──────────────────────────────────────────────────
    // Triggered by: process steps that include this command + policy reactions whose `then` is it.
    const triggers: string[] = [];
    for (const w of workflows) {
      if ((w.steps ?? []).includes(c.id)) triggers.push(`process step in **${w.name || w.id}** _(workflow ${w.id})_`);
    }
    policies.forEach((p, i) => {
      if (p.then !== c.id) return;
      const onName = evById.get(p.on)?.name || p.on;
      triggers.push(`reaction to **${onName}** — policy _${p.name || `on ${p.on}`}_ _(policy ${p.id || `policy_${i}`})_`);
    });
    triggers.push("direct user action in the UI, or an external trigger _(command is the universal action surface)_");

    // On success emits: the command's declared events (0..n; reject paths emit none).
    const emits = (c.emits ?? []).map((eid) => {
      const e = evById.get(eid);
      return e ? `**${e.name || e.id}** (\`${e.id}\`) — a fact about \`${e.aggregate}\`` : `\`${eid}\``;
    });

    // Authorized roles: roles that operate the command's issuing capability.
    const authorized = roles
      .filter((r) => (r.capabilities ?? []).includes(c.capability))
      .map((r) => `${r.name || r.id} _(role ${r.id})_`);

    // Delegation: is this command delegated to an external service by any workflow step binding?
    const delegatedBy = workflows
      .filter((w) => w.stepBindings?.[c.id])
      .map((w) => {
        const svc = svcById.get(w.stepBindings![c.id]);
        return `in **${w.name || w.id}**, this step is delegated to **${svc?.name || w.stepBindings![c.id]}** _(external service, ${svc?.invocation ?? "?"})_`;
      });

    // ── DECIDE (not in the model) ─────────────────────────────────────────
    // A policy's plain-language condition (N1: authored, NOT evaluated) is the closest the model gets
    // to a guard — surface it as a guard to implement, not as a fact.
    const guardHints = policies
      .filter((p) => p.then === c.id && p.condition)
      .map((p) => `Guard from policy _${p.name || p.on}_: "${p.condition}" — the model records this as prose (not evaluated); implement it as the real precondition.`);

    const md = renderBrief({
      commandName: c.name || c.id,
      commandId: c.id,
      aggId: c.aggregate,
      aggName: agg?.name || c.aggregate,
      runsOn,
      fields,
      triggers,
      emits,
      authorized,
      delegatedBy,
      guardHints,
    });

    return { id: c.id, name: c.name || c.id, path: `briefs/${slug(c.id)}.md`, markdown: md };
  });
}

function renderBrief(b: {
  commandName: string;
  commandId: string;
  aggId: string;
  aggName: string;
  runsOn: string;
  fields: { name: string; type?: string }[];
  triggers: string[];
  emits: string[];
  authorized: string[];
  delegatedBy: string[];
  guardHints: string[];
}): string {
  const fieldLines = b.fields.length
    ? b.fields.map((f) => `- \`${slug(f.name)}\` — ${f.type ?? "untyped"}`).join("\n")
    : "- _(no attributes modelled on this entity yet)_";
  const emitLines = b.emits.length ? b.emits.map((e) => `- ${e}`).join("\n") : "- _(emits no events — a pure read/transition, or not yet modelled)_";
  const authLine = b.authorized.length ? b.authorized.join(", ") : "_(no role restricts it in the model — decide who may call it)_";
  const delegationLine = b.delegatedBy.length ? b.delegatedBy.map((d) => `- ${d}`).join("\n") : "- none — runs internally on the engine above.";
  const guardBlock = b.guardHints.length ? b.guardHints.map((g) => `- [ ] ${g}`).join("\n") : "- [ ] Preconditions / guard: when may this request be **rejected**? (the model does not constrain this)";

  return `# Completion brief — ${b.commandName}

> Grounded in \`model.json\`. **LOCKED** lines are derived from the model (regenerated on export — change
> them in the model, not here). **DECIDE** items are genuinely not in the model — your call to implement.

- **Command:** \`${b.commandId}\`  ·  **Entity:** \`${b.aggId}\` (${b.aggName})  ·  **Runs on:** ${b.runsOn}

## 1 · LOCKED by the model _(derived — provenance in italics)_

**Input contract** — the typed attributes of \`${b.aggId}\` (validated before your handler runs):
${fieldLines}

**Triggered by:**
${b.triggers.map((t) => `- ${t}`).join("\n")}

**On success emits:**
${emitLines}

**Authorized roles:** ${authLine}

**Delegation:**
${delegationLine}

## 2 · FRAME — shape known, body yours

The handler is \`(input, ctx) => record\` in \`spine/src/handlers.ts\`. The runtime guarantees the input
fields above, persists the record you return, and emits the events above **around** your body. You write
only the transition in between — not the plumbing.

## 3 · DECIDE — not in the model _(implement these; don't guess them as fact)_

${guardBlock}
- [ ] The actual state change — which fields change, computed how.
- [ ] Side effects & ordering, idempotency, and error/rejection handling.
- [ ] Any external call or rule that isn't modelled as a service, event, or policy.
`;
}

/** An index page linking every command brief — written as `BRIEFS.md` at the repo root. */
export function briefsIndex(briefs: CommandBrief[]): string {
  const rows = briefs.map((b) => `- [\`${b.id}\`](${b.path}) — ${b.name}`).join("\n");
  return `# Completion briefs — one per command

The generated system is a **scaffold**: real structure, stubbed business logic. Each command below has a
grounded brief that separates what the model **LOCKS** (inputs, triggers, emitted events, roles,
delegation — derived, don't hand-edit) from what you must **DECIDE** (the guard and the actual logic).
Start from \`TODO.md\`; open a brief when you implement that command's handler.

${rows}
`;
}
