/**
 * MockProvider — a deterministic, dependency-free surrogate for the LLM (ADR-004).
 *
 * It derives capabilities from the narrative's Core Activities via a keyword→capability rule
 * table — the "mechanical derivation" the methodology describes. It is a stand-in for the
 * model's mechanical work, NOT its judgment (which is why A1 still needs the real provider).
 * Runs client-side and in tests: no key, no network, fully reproducible.
 */

import { sha256, slug } from "@vbd/ir";
import type { CapabilityDoc, CapabilityInput } from "@vbd/compiler";
import { anchorize, coreActivities, type NarrativeDoc } from "@vbd/narrative";
import type { LlmProvider, LlmRequest, LlmResult } from "./types.ts";

interface Rule {
  match: RegExp;
  id: string;
  name: string;
  purpose: string;
  outcome: string;
}

// General business-capability rules (not solar-specific) so the mock reads as domain-agnostic.
const RULES: Rule[] = [
  { match: /lead|acqui|prospect/i, id: "lead_management", name: "Lead Management", purpose: "Acquire and qualify prospective customers.", outcome: "qualified_lead" },
  { match: /custom|client|qualif|onboard/i, id: "customer_management", name: "Customer Management", purpose: "Manage customer relationships.", outcome: "customer_onboarded" },
  { match: /survey|design|plan|engineer|assess/i, id: "planning", name: "Planning", purpose: "Create technical designs for the customer's situation.", outcome: "approved_design" },
  { match: /offer|quote|propos|contract|sell|sale/i, id: "offer_management", name: "Offer Management", purpose: "Turn designs into commercial offers and win orders.", outcome: "signed_contract" },
  { match: /purchas|procure|material|supply|equip/i, id: "procurement", name: "Procurement", purpose: "Source and secure components and their availability.", outcome: "materials_available" },
  { match: /schedul|install|commission|mount|build|execut|deliver/i, id: "installation", name: "Installation", purpose: "Execute and commission the ordered work on site.", outcome: "work_commissioned" },
  { match: /invoice|bill|payment|financ/i, id: "billing", name: "Billing", purpose: "Financial settlement of delivered work.", outcome: "invoice_paid" },
  { match: /monitor|maintain|service|support|warrant|operate/i, id: "monitoring", name: "Monitoring & Service", purpose: "Operate, monitor, and maintain delivered systems.", outcome: "system_healthy" },
];

function ruleFor(activity: string): Rule {
  const hit = RULES.find((r) => r.match.test(activity));
  if (hit) return hit;
  const id = slug(activity) || "activity";
  return { match: /.^/, id, name: activity, purpose: `Handle: ${activity}.`, outcome: `${id}_done` };
}

/** Deterministically derive a CapabilityDoc from a narrative (client-side safe). */
export function mockGenerateCapabilities(narrative: NarrativeDoc): CapabilityDoc {
  const activities = coreActivities(narrative);
  const groups = new Map<string, { rule: Rule; acts: string[] }>();
  const order: string[] = [];

  for (const act of activities) {
    const rule = ruleFor(act);
    if (!groups.has(rule.id)) {
      groups.set(rule.id, { rule, acts: [] });
      order.push(rule.id);
    }
    groups.get(rule.id)!.acts.push(act);
  }

  const capabilities: CapabilityInput[] = order.map((id, i) => {
    const { rule, acts } = groups.get(id)!;
    return {
      id,
      name: rule.name,
      purpose: rule.purpose,
      outcomes: [rule.outcome],
      depends_on: i > 0 ? [order[i - 1]] : [],
      meta: {
        origin: "llm",
        skillVersion: "capgen-mock@0.1",
        derivedFrom: acts.map((a) => ({
          section: "Core Activities",
          anchor: anchorize(a),
          contentHash: sha256(a),
        })),
      },
    };
  });

  return {
    version: "0.2",
    domain: slug(narrative.title || "business") || "business",
    capabilities,
  };
}

export class MockProvider implements LlmProvider {
  readonly name = "mock";
  async complete(req: LlmRequest): Promise<LlmResult> {
    const narrative = req.context as NarrativeDoc;
    const doc = mockGenerateCapabilities(narrative);
    return { json: doc, raw: JSON.stringify(doc), provider: this.name };
  }
}
