/**
 * @kiln/codegen/integrations — the INTEGRATION layer (acquire + transfer).
 *
 * Business apps don't live alone: they pull data in from existing systems and push data/events out.
 * Same shape as communications — external EFFECTS triggered by the same machinery, driven by a FIELD
 * MAPPING, hosted on n8n (the reason you picked it — hundreds of connectors). Two directions:
 *   • inbound  (acquire):  an external system → map fields → a CREATE command on the spine.
 *   • outbound (transfer): a model EVENT → map fields → an external system's API.
 *
 * The mapping (model field ↔ external field) is the authored artifact; the mock seeds a 1:1 a human
 * refines. Pure and isomorphic. `mockIntegrations` derives defaults; an LLM pass can refine them.
 */

import { slug } from "@kiln/ir";
import { attributeSpecs, type CapabilityDoc, type DomainDoc } from "@kiln/compiler";
import type { N8nWorkflow } from "./targets.ts";

export type IntegrationDirection = "inbound" | "outbound";
/** How the records move: a JSON API (default) or a spreadsheet — Excel is one of the most common. */
export type IntegrationTransport = "api" | "xlsx" | "gsheet";

export interface IntegrationAction {
  id: string;
  name: string;
  direction: IntegrationDirection;
  system: string; // "CRM", "Accounting", "ERP", "Excel", …
  entity: string; // model entity id
  trigger: string; // inbound: the create-command id to invoke; outbound: the event id
  mapping: Record<string, string>; // model field → external field / column (seeded 1:1)
  transport?: IntegrationTransport; // default "api"; xlsx/gsheet route through n8n's spreadsheet nodes
}

export interface IntegrationsDoc {
  actions: IntegrationAction[];
}

const CREATE_VERB = /^(create|add|register|open|new|capture|import)_/;
const systemFor = (entity: string): string =>
  /lead|customer|contact|account|opportunity/.test(entity) ? "CRM" : /invoice|payment|statement|ledger/.test(entity) ? "Accounting" : /order|purchase_order|product|inventory|shipment/.test(entity) ? "ERP" : "External";

const identityMapping = (fields: string[]): Record<string, string> => Object.fromEntries(["id", ...fields].map((f) => [f, f]));

/** Deterministic default integrations derived from create-commands (inbound) and lifecycle events (outbound). */
export function mockIntegrations(caps: CapabilityDoc, domain: DomainDoc): IntegrationsDoc {
  void caps;
  const aggById = new Map(domain.aggregates.map((a) => [a.id, a]));
  const actions: IntegrationAction[] = [];

  // inbound: acquire records into customer-facing entities via their create command.
  for (const c of domain.commands ?? []) {
    const action = slug(c.name || c.id);
    if (!CREATE_VERB.test(`${action}_`)) continue;
    if (!/lead|customer|contact|account/.test(c.aggregate)) continue; // the entities you typically import
    const agg = aggById.get(c.aggregate);
    if (!agg) continue;
    const sys = systemFor(c.aggregate);
    actions.push({ id: `in_${slug(c.aggregate)}_${sys.toLowerCase()}`, name: `Import ${agg.name || agg.id} from ${sys}`, direction: "inbound", system: sys, entity: c.aggregate, trigger: slug(c.id), mapping: identityMapping(attributeSpecs(agg).map((f) => slug(f.name))) });
  }

  // outbound: transfer/sync on lifecycle events of the entities other systems care about.
  const seen = new Set<string>();
  for (const e of domain.events ?? []) {
    if (!/created|updated|paid|issued|completed|approved|received/.test(e.id)) continue;
    if (!/customer|invoice|order|payment|product|purchase_order/.test(e.aggregate)) continue;
    const key = `${e.aggregate}:${systemFor(e.aggregate)}`;
    if (seen.has(key)) continue; // one outbound sync per (entity, system)
    seen.add(key);
    const agg = aggById.get(e.aggregate);
    if (!agg) continue;
    const sys = systemFor(e.aggregate);
    actions.push({ id: `out_${slug(e.aggregate)}_${sys.toLowerCase()}`, name: `Sync ${agg.name || agg.id} to ${sys}`, direction: "outbound", system: sys, entity: e.aggregate, trigger: e.id, mapping: identityMapping(attributeSpecs(agg).map((f) => slug(f.name))) });
  }

  const capped = actions.slice(0, 12);
  // Excel is one of the most common business tools — seed one spreadsheet import so it's first-class.
  // The first importable inbound action gets an Excel twin (same mapping; rows → the create command).
  const firstIn = capped.find((a) => a.direction === "inbound");
  if (firstIn) capped.push({ ...firstIn, id: `in_${slug(firstIn.entity)}_excel`, name: `Import ${firstIn.entity} from Excel`, system: "Excel", transport: "xlsx" });
  return { actions: capped };
}

/** The spine endpoint a create command maps to (mirrors the spine/OpenAPI convention). */
function createEndpoint(domain: DomainDoc, commandId: string): string {
  const c = (domain.commands ?? []).find((x) => slug(x.id) === commandId || x.id === commandId);
  return `/${slug(c?.aggregate ?? "records")}s`;
}

// A spreadsheet source/sink node (Excel 365 or Google Sheets) — n8n's native connectors are exactly why
// n8n is the seam. Params kept minimal (credentials + workbook/range are hand-owned); structurally faithful.
function sheetNode(transport: IntegrationTransport, mode: "read" | "append", entity: string, x: number, y: number): Record<string, unknown> {
  const gsheet = transport === "gsheet";
  const type = gsheet ? "n8n-nodes-base.googleSheets" : "n8n-nodes-base.microsoftExcel";
  const name = `${mode === "read" ? "Read" : "Append"} ${gsheet ? "Google Sheet" : "Excel"} (${entity})`;
  const operation = mode === "read" ? (gsheet ? "read" : "getItems") : gsheet ? "append" : "append";
  return { parameters: { operation, note: `TODO: set ${gsheet ? "documentId + sheetName" : "workbook + worksheet"} + credentials; columns follow the mapping` }, name, type, typeVersion: gsheet ? 4 : 2, position: [x, y] };
}

/** Emit field-mapping files + n8n workflows (inbound: → spine command; outbound: event → external API/sheet). */
export function integrationsAdapter(integrations: IntegrationsDoc, domain: DomainDoc, spineUrl = "http://spine.local"): { mappings: Record<string, string>; n8n: N8nWorkflow[] } {
  const mappings: Record<string, string> = {};
  const n8n: N8nWorkflow[] = [];
  for (const a of integrations.actions) {
    const transport = a.transport ?? "api";
    mappings[`integrations/${a.id}.mapping.json`] = JSON.stringify({ id: a.id, direction: a.direction, system: a.system, entity: a.entity, trigger: a.trigger, transport, mapping: a.mapping }, null, 2);

    if (a.direction === "inbound") {
      const call = { parameters: { method: "POST", url: `${spineUrl}${createEndpoint(domain, a.trigger)}`, sendBody: true }, name: `Create ${a.entity}`, type: "n8n-nodes-base.httpRequest", typeVersion: 4, position: [800, 300] };
      let nodes: Array<Record<string, unknown>>;
      let connections: Record<string, unknown>;
      if (transport === "api") {
        // external system → webhook → map → POST the create command on the spine.
        const trigger = { parameters: { httpMethod: "POST", path: `ingest/${slug(a.entity)}` }, name: `From ${a.system}`, type: "n8n-nodes-base.webhook", typeVersion: 2, position: [240, 300] };
        nodes = [trigger, { ...call, position: [520, 300] }];
        connections = { [trigger.name]: { main: [[{ node: call.name, type: "main", index: 0 }]] } };
      } else {
        // spreadsheet → poll on a schedule → read rows → map → POST the create command per row.
        const trigger = { parameters: { rule: { interval: [{ field: "hours" }] } }, name: `Poll ${a.system}`, type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1, position: [240, 300] };
        const read = sheetNode(transport, "read", a.entity, 520, 300);
        nodes = [trigger, read, call];
        connections = { [trigger.name]: { main: [[{ node: read.name as string, type: "main", index: 0 }]] }, [read.name as string]: { main: [[{ node: call.name, type: "main", index: 0 }]] } };
      }
      n8n.push({ id: `kiln_${a.id}`, name: `Integration (in): ${a.name}`, nodes, connections, active: false, settings: { executionOrder: "v1" } });
    } else {
      // model event → webhook → map → external system's API or spreadsheet append.
      const trigger = { parameters: { httpMethod: "POST", path: `on/${slug(a.trigger)}` }, name: `On ${a.trigger}`, type: "n8n-nodes-base.webhook", typeVersion: 2, position: [240, 300] };
      const action =
        transport === "api"
          ? { parameters: { method: "POST", url: `https://${a.system.toLowerCase()}.example.com/api/${slug(a.entity)}`, sendBody: true, note: "TODO: real endpoint + auth + apply mapping" }, name: `Push to ${a.system}`, type: "n8n-nodes-base.httpRequest", typeVersion: 4, position: [520, 300] }
          : sheetNode(transport, "append", a.entity, 520, 300);
      n8n.push({ id: `kiln_${a.id}`, name: `Integration (out): ${a.name}`, nodes: [trigger, action], connections: { [trigger.name]: { main: [[{ node: action.name as string, type: "main", index: 0 }]] } }, active: false, settings: { executionOrder: "v1" } });
    }
  }
  return { mappings, n8n };
}
