/**
 * @vbd/narrative — the Business Narrative parser & validators (SPEC-001 §3.1, M1).
 *
 * The narrative is authored markdown (the source of truth). We parse it into a structured
 * `NarrativeDoc` whose sections carry **heading-path anchors + content hashes** (NOT line
 * numbers, per REV-002 F5), so downstream capability provenance (`meta.derivedFrom`) can
 * reference them stably across edits.
 */

import { sha256 } from "@vbd/ir";
import { finding, type Finding } from "@vbd/validation";

export interface NarrativeSection {
  heading: string;
  level: number;
  /** stable anchor derived from the heading (hyphenated slug). */
  anchor: string;
  /** hash of the normalized section body — changes iff the content changes. */
  contentHash: string;
  body: string;
  /** bullet items ("- …") within the section, in order. */
  items: string[];
}

export interface NarrativeDoc {
  title: string;
  sections: NarrativeSection[];
  sourceFile: string;
}

/** Required sections for a well-formed narrative (SPEC-001 §3.1). */
export const REQUIRED_SECTIONS = ["Purpose", "Customers", "Business Outcomes", "Core Activities"];

/** Stable hyphenated anchor from a heading or item (shared with capability provenance). */
export function anchorize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalize(body: string): string {
  return body.replace(/\s+/g, " ").trim();
}

/** Parse authored narrative markdown into a structured, anchored NarrativeDoc. */
export function parseNarrative(md: string, sourceFile = "narrative.md"): NarrativeDoc {
  const lines = md.split(/\r?\n/);
  let title = "";
  const sections: NarrativeSection[] = [];
  let cur: { heading: string; level: number; bodyLines: string[] } | null = null;

  const flush = (): void => {
    if (!cur) return;
    const body = cur.bodyLines.join("\n").trim();
    const items = cur.bodyLines
      .map((l) => l.trim())
      .filter((l) => l.startsWith("- "))
      .map((l) => l.slice(2).trim());
    sections.push({
      heading: cur.heading,
      level: cur.level,
      anchor: anchorize(cur.heading),
      contentHash: sha256(normalize(body)),
      body,
      items,
    });
    cur = null;
  };

  for (const line of lines) {
    const h2 = /^##\s+(.+)$/.exec(line);
    const h1 = /^#\s+(.+)$/.exec(line);
    if (h2) {
      flush();
      cur = { heading: h2[1].trim(), level: 2, bodyLines: [] };
    } else if (h1) {
      flush();
      title = h1[1].trim();
    } else if (cur) {
      cur.bodyLines.push(line);
    }
  }
  flush();

  return { title, sections, sourceFile };
}

export function getSection(doc: NarrativeDoc, heading: string): NarrativeSection | undefined {
  return doc.sections.find((s) => s.heading === heading);
}

export function sectionItems(doc: NarrativeDoc, heading: string): string[] {
  return getSection(doc, heading)?.items ?? [];
}

export const businessOutcomes = (doc: NarrativeDoc): string[] => sectionItems(doc, "Business Outcomes");
export const coreActivities = (doc: NarrativeDoc): string[] => sectionItems(doc, "Core Activities");
export const customers = (doc: NarrativeDoc): string[] => sectionItems(doc, "Customers");

/** Narrative completeness validators (NV1–NV3). Reuse the shared Finding type. */
export function validateNarrative(doc: NarrativeDoc): Finding[] {
  const findings: Finding[] = [];
  const have = new Set(doc.sections.map((s) => s.heading));
  for (const req of REQUIRED_SECTIONS) {
    if (!have.has(req)) findings.push(finding("NV1.section", "major", `missing required section '${req}'`, [req]));
  }
  if (businessOutcomes(doc).length === 0) {
    findings.push(finding("NV2.outcomes", "major", "Business Outcomes has no items", ["Business Outcomes"]));
  }
  if (coreActivities(doc).length === 0) {
    findings.push(finding("NV3.activities", "major", "Core Activities has no items", ["Core Activities"]));
  }
  if (!doc.title.trim()) {
    findings.push(finding("NV4.title", "major", "narrative has no title (top-level # heading)", ["<title>"]));
  }
  return findings;
}

/** The derived `narrative.json` payload (SPEC-001 §3). */
export function toNarrativeJson(doc: NarrativeDoc): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}
