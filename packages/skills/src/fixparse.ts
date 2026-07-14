// Surgical single-finding fixes. A critique suggestion is prose ("Add: on offer_accepted → then
// schedule_installation."), but for the common shapes it encodes a concrete, deterministic model edit.
// parseFinding extracts that intent (by NAME); the app resolves the names against the live model and
// mutates just that one thing — no full-layer regeneration, so it CONVERGES (unlike generative Apply).
// Anything it can't confidently parse returns null → the UI falls back to "fix it by hand".

import type { LayerKind } from "./critic.ts";

export type FixIntent =
  | { kind: "addPolicy"; on: string; then: string }
  | { kind: "addAttribute"; entity: string; attrs: { name: string; type: string }[] }
  | { kind: "addReference"; entity: string; to: string };

const ATTR_TYPE = "(?:text|number|boolean|date|money|reference)";

/** Best-effort parse of a finding's suggestion into a concrete edit, or null if it isn't a shape we can
 *  apply safely. Only the additive patterns the critic actually emits are handled. */
export function parseFinding(
  layer: LayerKind,
  finding: { message: string; suggestion?: string; target?: string },
): FixIntent | null {
  const text = (finding.suggestion ?? "").trim();
  if (!text) return null;

  if (layer === "automations") {
    // "on <event> → then <command>" (also -> / =>). Reactions are the dominant automations suggestion.
    const m = text.match(/on\s+([A-Za-z0-9_]+)\s*(?:→|->|=>)\s*then\s+([A-Za-z0-9_]+)/i);
    return m ? { kind: "addPolicy", on: m[1], then: m[2] } : null;
  }

  if (layer === "entities") {
    // "add total:money and issuedOn:date to the Invoice entity"
    const attrs: { name: string; type: string }[] = [];
    const attrRe = new RegExp(`\\b([a-z_][A-Za-z0-9_]*)\\s*:\\s*(${ATTR_TYPE})\\b`, "gi");
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(text))) attrs.push({ name: a[1], type: a[2].toLowerCase() });
    if (attrs.length) {
      const entity = finding.target ?? text.match(/to\s+(?:the\s+)?([A-Za-z0-9_]+)/i)?.[1];
      if (entity) return { kind: "addAttribute", entity, attrs };
    }
    // "add a supplier reference to purchase_order" → entity=purchase_order references supplier
    const ref = text.match(/\b([A-Za-z0-9_]+)\s+reference\s+to\s+(?:the\s+)?([A-Za-z0-9_]+)/i);
    if (ref) return { kind: "addReference", entity: ref[2], to: ref[1] };
    return null;
  }

  return null;
}
