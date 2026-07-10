import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parseNarrative,
  validateNarrative,
  businessOutcomes,
  coreActivities,
  customers,
  getSection,
  toNarrativeJson,
  REQUIRED_SECTIONS,
} from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const solarPath = join(here, "..", "..", "..", "workspaces", "solar-example", "business", "narrative.md");
const solarMd = readFileSync(solarPath, "utf8");

test("parses the solar narrative title and sections", () => {
  const doc = parseNarrative(solarMd, solarPath);
  assert.equal(doc.title, "Sonnenkraft Solar GmbH");
  const headings = doc.sections.map((s) => s.heading);
  for (const req of REQUIRED_SECTIONS) assert.ok(headings.includes(req), `missing ${req}`);
  assert.ok(headings.includes("Constraints"));
});

test("extracts list items from the narrative", () => {
  const doc = parseNarrative(solarMd, solarPath);
  assert.equal(businessOutcomes(doc).length, 3);
  assert.equal(coreActivities(doc).length, 12);
  assert.equal(customers(doc).length, 2);
  assert.deepEqual(businessOutcomes(doc), ["Sell projects", "Install systems", "Maintain systems"]);
});

test("section anchors are stable, hyphenated slugs", () => {
  const doc = parseNarrative(solarMd, solarPath);
  assert.equal(getSection(doc, "Business Outcomes")?.anchor, "business-outcomes");
  assert.equal(getSection(doc, "Core Activities")?.anchor, "core-activities");
});

test("contentHash changes iff the section body changes", () => {
  const a = parseNarrative(solarMd, solarPath);
  const hashA = getSection(a, "Purpose")?.contentHash;
  // Re-parsing identical text yields identical hashes.
  const b = parseNarrative(solarMd, solarPath);
  assert.equal(getSection(b, "Purpose")?.contentHash, hashA);
  // Editing the Purpose body changes only that hash.
  const edited = solarMd.replace("renewable energy systems", "renewable energy and storage systems");
  const c = parseNarrative(edited, solarPath);
  assert.notEqual(getSection(c, "Purpose")?.contentHash, hashA);
  assert.equal(getSection(c, "Customers")?.contentHash, getSection(a, "Customers")?.contentHash);
});

test("a complete narrative validates cleanly", () => {
  const doc = parseNarrative(solarMd, solarPath);
  assert.deepEqual(validateNarrative(doc), []);
});

test("a missing required section is flagged (NV1)", () => {
  const withoutCustomers = solarMd.replace(/## Customers[\s\S]*?(?=\n## )/, "");
  const doc = parseNarrative(withoutCustomers, solarPath);
  const f = validateNarrative(doc);
  assert.ok(f.some((x) => x.code === "NV1.section" && x.subjects.includes("Customers")));
});

test("empty Business Outcomes is flagged (NV2)", () => {
  const md = "# X\n## Purpose\np\n## Customers\n- A\n## Business Outcomes\n## Core Activities\n- do\n";
  const doc = parseNarrative(md, "t.md");
  assert.ok(validateNarrative(doc).some((x) => x.code === "NV2.outcomes"));
});

test("toNarrativeJson round-trips structurally", () => {
  const doc = parseNarrative(solarMd, solarPath);
  const parsed = JSON.parse(toNarrativeJson(doc));
  assert.equal(parsed.title, doc.title);
  assert.equal(parsed.sections.length, doc.sections.length);
});
