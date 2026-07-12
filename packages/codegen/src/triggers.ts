/**
 * @vbd/codegen/triggers — the TRIGGERS layer: external signals INTO the system.
 *
 * A business doesn't only act when a user clicks. It reacts to inbound signals — a webhook from another
 * system, or a schedule (a nightly run) — and routes each to the right actor: run a COMMAND, start a
 * WORKFLOW, wake an AGENT, or NOTIFY a human. This projects such triggers to n8n workflows: a source node
 * (webhook | schedule/cron) wired to an action node (spine command | execute-workflow | agent /run |
 * notify). It closes the loop with the generated agents' HTTP mode — a webhook can now WAKE an agent.
 * Pure + isomorphic; deterministic mock defaults here, an LLM refine pass in @vbd/skills.
 */

import { slug } from "@vbd/ir";
import type { CapabilityDoc, DomainDoc, WorkflowsDoc, AgentsDoc } from "@vbd/compiler";
import { commandEndpoint, type N8nWorkflow } from "./targets.ts";

export type TriggerSource = "webhook" | "schedule";
export type TriggerTargetKind = "command" | "workflow" | "agent" | "notify";
export interface TriggerTarget {
  kind: TriggerTargetKind;
  ref: string; // command id | workflow id | agent id | recipient
  task?: string; // for agent targets: what to do with the signal
}
export interface TriggerInput {
  id: string;
  name: string;
  source: TriggerSource;
  path?: string; // webhook path (source = webhook)
  cron?: string; // cron expression (source = schedule)
  target: TriggerTarget;
  rationale?: string;
}
export interface TriggersDoc {
  version?: string;
  triggers: TriggerInput[];
}

/**
 * Deterministic defaults, grounded in the model's own external/time EVENTS (the discriminator that says
 * "this fact originates outside a user command"): an external event → an inbound webhook; a time event →
 * a cron schedule. Each routes to the covering AGENT if one exists (the judgment surface for open-ended
 * signals), else notifies a human. Plus one explicit webhook that wakes the first agent — the canonical
 * "an external system starts an agent" entry point. Lean by design (avoid over-wiring).
 */
export function mockTriggers(_caps: CapabilityDoc, domain: DomainDoc, _workflows?: WorkflowsDoc, agents?: AgentsDoc): TriggersDoc {
  const triggers: TriggerInput[] = [];
  const firstAgent = agents?.agents?.[0];
  const evName = new Map((domain.events ?? []).map((e) => [e.id, e.name || e.id]));
  const route = (label: string): TriggerTarget =>
    firstAgent
      ? { kind: "agent", ref: slug(firstAgent.id), task: `An inbound signal (${label}) arrived — handle it toward your goal.` }
      : { kind: "notify", ref: "ops" };
  for (const e of domain.events ?? []) {
    const nm = evName.get(e.id) ?? e.id;
    if (e.trigger === "external") triggers.push({ id: `hook_${slug(e.id)}`, name: `Webhook: ${nm}`, source: "webhook", path: `hook/${slug(e.id)}`, target: route(nm), rationale: `${nm} is an external event — expose an inbound webhook and route the signal.` });
    else if (e.trigger === "time") triggers.push({ id: `cron_${slug(e.id)}`, name: `Schedule: ${nm}`, source: "schedule", cron: "0 * * * *", target: route(nm), rationale: `${nm} is time-triggered — run it on a schedule.` });
  }
  if (firstAgent && !triggers.some((t) => t.source === "webhook" && t.target.kind === "agent"))
    triggers.push({ id: `hook_agent_${slug(firstAgent.id)}`, name: `Webhook: wake ${firstAgent.name || firstAgent.id}`, source: "webhook", path: `hook/agent/${slug(firstAgent.id)}`, target: { kind: "agent", ref: slug(firstAgent.id), task: "Handle the incoming signal toward your goal." }, rationale: `Let an external system wake the ${firstAgent.name || firstAgent.id} to handle an inbound signal.` });
  return { version: "0.1", triggers };
}

/** Project triggers to n8n workflows: source (webhook|schedule) → action (command|workflow|agent|notify). */
export function triggersAdapter(triggers: TriggersDoc, domain: DomainDoc, spineUrl = "http://spine.local/api", agentUrl = "http://agents.local"): N8nWorkflow[] {
  const cmdById = new Map((domain.commands ?? []).map((c) => [c.id, c]));
  const out: N8nWorkflow[] = [];
  for (const t of triggers.triggers ?? []) {
    const source: Record<string, unknown> =
      t.source === "schedule"
        ? { parameters: { rule: { interval: [{ field: "cronExpression", expression: t.cron || "0 * * * *" }] } }, name: t.name, type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1, position: [240, 300] }
        : { parameters: { httpMethod: "POST", path: t.path || `hook/${slug(t.id)}` }, name: t.name, type: "n8n-nodes-base.webhook", typeVersion: 2, position: [240, 300] };
    const tgt = t.target;
    let action: Record<string, unknown>;
    if (tgt.kind === "command") {
      const cmd = cmdById.get(tgt.ref);
      const ep = cmd ? commandEndpoint(cmd) : { method: "POST", path: `/unknown/${slug(tgt.ref)}` };
      action = { parameters: { method: ep.method, url: `${spineUrl}${ep.path}`, sendBody: true }, name: `Command: ${cmd?.name || tgt.ref}`, type: "n8n-nodes-base.httpRequest", typeVersion: 4, position: [520, 300] };
    } else if (tgt.kind === "agent") {
      // wake the agent over HTTP — POST /run { agent, task } to the generated agents runtime (pnpm serve).
      action = { parameters: { method: "POST", url: `${agentUrl}/run`, sendBody: true, specifyBody: "json", jsonBody: JSON.stringify({ agent: tgt.ref, task: tgt.task || "Handle the inbound signal." }) }, name: `Agent: ${tgt.ref}`, type: "n8n-nodes-base.httpRequest", typeVersion: 4, position: [520, 300] };
    } else if (tgt.kind === "workflow") {
      // start a generated process workflow (its n8n id is vbd_process_<id>). executeWorkflow is the n8n
      // primitive for this — structurally faithful (not yet round-tripped through a live import).
      action = { parameters: { source: "database", workflowId: `vbd_process_${slug(tgt.ref)}` }, name: `Workflow: ${tgt.ref}`, type: "n8n-nodes-base.executeWorkflow", typeVersion: 1, position: [520, 300] };
    } else {
      // notify → a placeholder Set node capturing the message (wire to email/Slack like the comms layer).
      action = { parameters: { values: { string: [{ name: "notify", value: `route ${t.name} to ${tgt.ref}` }] } }, name: `Notify: ${tgt.ref}`, type: "n8n-nodes-base.set", typeVersion: 3, position: [520, 300] };
    }
    out.push({ id: `vbd_trigger_${slug(t.id)}`, name: `Trigger: ${t.name}`, nodes: [source, action], connections: { [t.name]: { main: [[{ node: action.name as string, type: "main", index: 0 }]] } }, active: false, settings: { executionOrder: "v1" } });
  }
  return out;
}
