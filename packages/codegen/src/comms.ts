/**
 * @kiln/codegen/comms — the COMMUNICATION layer (notify + render).
 *
 * Every business app sends things: emails, Slack/Teams messages, PDF/Word documents. These are a new
 * class of action — EFFECTS that communicate/produce rather than change domain state — and they fit the
 * existing machinery: an EVENT (or a workflow step, or an agent tool) triggers a TEMPLATE-BASED action
 * with a recipient. "Invoice Issued → render the invoice PDF → email it to the customer."
 *
 * Templates are authored artifacts (like prompts): editable files with {{field}} placeholders. Notify
 * actions run on n8n (native email/Slack nodes — the seam the spine already POSTs events to); render
 * actions produce documents. Agents get these actions as tools alongside commands.
 *
 * Pure and isomorphic. `mockCommunications` derives sensible defaults; an LLM pass can refine them.
 */

import { slug } from "@kiln/ir";
import { attributeSpecs, type CapabilityDoc, type DomainDoc } from "@kiln/compiler";
import type { N8nWorkflow } from "./targets.ts";

export type CommChannel = "email" | "slack" | "pdf" | "spreadsheet";

export interface CommAction {
  id: string;
  name: string;
  channel: CommChannel;
  on: string; // trigger: an event id
  entity: string; // the event's aggregate (for field binding)
  recipient: string; // binding: "{{customer_email}}", "#sales", …
  subject: string;
  template: string; // body with {{field}} placeholders
}

export interface CommunicationsDoc {
  actions: CommAction[];
}

// Which events are "notify-worthy" — lifecycle facts a business would announce or document.
const NOTIFY = /issued|sent|completed|approved|paid|captured|scheduled|opened|created|qualified|cancelled|received|delivered|shipped|overdue/;
const DOC_ENTITY = /invoice|offer|quote|order|contract|proposal|statement/;

function bodyFor(entityName: string, fields: string[], verb: string): string {
  const lines = [`${entityName} {{id}} has been ${verb}.`, ""];
  for (const f of fields.slice(0, 6)) lines.push(`- ${f}: {{${f}}}`);
  lines.push("", "— Sent automatically by the {{system}} system.");
  return lines.join("\n");
}

/** Deterministic default communications derived from the behaviour layer's events. */
export function mockCommunications(caps: CapabilityDoc, domain: DomainDoc): CommunicationsDoc {
  const aggById = new Map(domain.aggregates.map((a) => [a.id, a]));
  const capName = new Map(caps.capabilities.map((c) => [c.id, c.name || c.id]));
  const actions: CommAction[] = [];
  for (const e of domain.events ?? []) {
    if (!NOTIFY.test(e.id)) continue;
    const agg = aggById.get(e.aggregate);
    if (!agg) continue;
    const entityName = agg.name || agg.id;
    const fields = attributeSpecs(agg).map((f) => slug(f.name));
    const verb = (e.name || e.id).toLowerCase().replace(new RegExp(`^${entityName.toLowerCase()}\\s*`), "").trim() || "updated";
    const refsCustomer = (agg.references ?? []).includes("customer") || agg.id === "customer";
    const isDoc = DOC_ENTITY.test(e.aggregate);

    if (isDoc && /issued|sent|created/.test(e.id)) {
      // a document + email to the customer
      actions.push({ id: `email_${slug(e.id)}`, name: `Email ${entityName} on ${e.name || e.id}`, channel: "email", on: e.id, entity: e.aggregate, recipient: refsCustomer ? "{{customer_email}}" : "{{recipient_email}}", subject: `Your ${entityName} {{id}}`, template: bodyFor(entityName, fields, verb) });
      actions.push({ id: `pdf_${slug(e.id)}`, name: `Render ${entityName} PDF`, channel: "pdf", on: e.id, entity: e.aggregate, recipient: "attachment", subject: `${entityName} {{id}}`, template: bodyFor(entityName, fields, verb) });
    } else {
      // a Slack alert to the owning capability's channel
      actions.push({ id: `slack_${slug(e.id)}`, name: `Slack alert on ${e.name || e.id}`, channel: "slack", on: e.id, entity: e.aggregate, recipient: `#${slug(capName.get(agg.owner) ?? agg.owner)}`, subject: `${entityName} ${verb}`, template: `*${entityName} ${verb}* — {{id}}\n${fields.slice(0, 4).map((f) => `${f}: {{${f}}}`).join(" · ")}` });
    }
  }
  // Excel/spreadsheet output is as common as PDF — seed one register export off the first document entity.
  // cap to keep the default sensible; the LLM pass can add/trim per the business.
  const capped = actions.slice(0, 14);
  const firstDoc = capped.find((a) => a.channel === "pdf");
  if (firstDoc) capped.push({ ...firstDoc, id: `xlsx_${slug(firstDoc.entity)}`, name: `Export ${firstDoc.entity} register (Excel)`, channel: "spreadsheet", recipient: "attachment", subject: `${firstDoc.entity} register` });
  return { actions: capped };
}

/** Emit templates + n8n notify workflows (wired to the event webhooks the spine already POSTs to). */
export function communicationsAdapter(comms: CommunicationsDoc, baseUrl = "http://spine.local"): { templates: Record<string, string>; n8n: N8nWorkflow[] } {
  const templates: Record<string, string> = {};
  const n8n: N8nWorkflow[] = [];
  for (const a of comms.actions) {
    templates[`templates/${a.id}.md`] = `Subject: ${a.subject}\nTo: ${a.recipient}\nChannel: ${a.channel}\n---\n${a.template}\n`;
    if (a.channel === "pdf" || a.channel === "spreadsheet") continue; // rendered docs (a render/xlsx service); no n8n flow

    const trigger = { parameters: { httpMethod: "POST", path: `on/${slug(a.on)}` }, name: `On ${a.on}`, type: "n8n-nodes-base.webhook", typeVersion: 2, position: [240, 300] };
    const action =
      a.channel === "email"
        ? { parameters: { toEmail: a.recipient, subject: a.subject, text: a.template, options: {} }, name: "Send Email", type: "n8n-nodes-base.emailSend", typeVersion: 2, position: [520, 300] }
        : { parameters: { select: "channel", channelId: a.recipient, text: a.template }, name: "Post to Slack", type: "n8n-nodes-base.slack", typeVersion: 2, position: [520, 300] };
    n8n.push({
      id: `kiln_comm_${a.id}`,
      name: `Comm: ${a.name}`,
      nodes: [trigger, action],
      connections: { [trigger.name]: { main: [[{ node: action.name, type: "main", index: 0 }]] } },
      active: false,
      settings: { executionOrder: "v1" },
    });
  }
  void baseUrl;
  return { templates, n8n };
}
