/**
 * invariants.test.ts — CI gate for two golden invariants (CLAUDE.md), enforced by scanning source.
 *
 * This is a TEST, so reading files with node:fs is fine (invariant #4 forbids node:* only in the
 * SHIPPED, browser-loaded package sources — not in tests). The checks below fail loudly, with the
 * offending file:line, so a community PR that breaks an invariant can never merge green.
 *
 *   #4  Pure packages are isomorphic: no `node:*` import (nor bare `process.` / `require(`) in the
 *       browser-loaded sources of @kiln/{ir,compiler,validation,narrative,skills,eval} or the pure
 *       @kiln/codegen engines dir.
 *   #3  Secrets never reach the browser: apps/web/src must never reference the Anthropic key.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", ".."); // packages/codegen/test → repo root

/** Recursively collect *.ts / *.tsx files under a dir (skips node_modules, dist, .kiln). */
function collectSources(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // dir may not exist in a given tree
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name === ".kiln") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collectSources(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const rel = (f: string) => relative(repoRoot, f);

/**
 * Return the file's text with comment bodies and string/template-literal CONTENTS blanked out, so a
 * regex scan sees only real code. We keep the delimiters (so line/column math is unaffected) but
 * strip what's inside, so `node:fs` mentioned in a doc-comment or embedded in a prompt string (e.g.
 * skills/src/prompts.generated.ts) is NOT mistaken for a real import. The `node:` import check below
 * is delimiter-aware separately; this stripping backs the bare `process.` / `require(` check.
 */
function stripCommentsAndStrings(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    // line comment
    if (c === "/" && c2 === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    // block comment
    if (c === "/" && c2 === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") out += "\n";
        i++;
      }
      i += 2;
      continue;
    }
    // string / template literal — blank the interior, keep newlines for line numbers
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += quote;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\") {
          i += 2; // skip escaped char
          continue;
        }
        if (src[i] === "\n") out += "\n";
        i++;
      }
      if (i < n) out += quote;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split("\n").length;
}

// ── Invariant #4: pure packages have no node:* / bare process. / require( ──────────────────────
//
// Scanned dirs = every browser-loaded pure source tree. The @kiln/codegen ENGINES + DEPLOY dirs are pure too.
const pureDirs = [
  "packages/ir/src",
  "packages/compiler/src",
  "packages/validation/src",
  "packages/narrative/src",
  "packages/skills/src",
  "packages/eval/src",
  "packages/codegen/src/engines",
  "packages/codegen/src/deploy",
];

/**
 * Allowlist — files that are Node-only by design and NOT part of the isomorphic surface:
 *   *.solar.ts (in @kiln/eval)  — reference-corpus loaders that read the on-disk workspace fixture
 *                                (a subpath export like ./generation.solar, never re-exported from
 *                                the isomorphic index.ts). They are Node-only, analogous to tests.
 * Keep this list TIGHT — every entry is an escape hatch from the isomorphism guarantee.
 */
function isNodeOnlyAllowed(file: string): boolean {
  return /\.solar\.ts$/.test(file);
}

// A real `node:` import/require — NOT a mention in prose or a comment.
const NODE_IMPORT = /(?:\bfrom\s*|\bimport\s*|\brequire\s*\(\s*)["']node:[^"']+["']/;

test("invariant #4: pure package sources import no node:* builtin", () => {
  const violations: string[] = [];
  for (const d of pureDirs) {
    for (const file of collectSources(join(repoRoot, d))) {
      if (isNodeOnlyAllowed(file)) continue;
      const src = readFileSync(file, "utf8");
      const m = NODE_IMPORT.exec(src);
      if (m) violations.push(`${rel(file)}:${lineOf(src, m.index)}  ${m[0]}`);
    }
  }
  assert.equal(
    violations.length,
    0,
    `pure packages must not import node:* builtins (use the isomorphic sha256 from @kiln/ir, not node:crypto):\n  ${violations.join("\n  ")}`,
  );
});

test("invariant #4: pure package sources use no bare process. / require(", () => {
  const violations: string[] = [];
  // Bare global usage — after comments & string contents are blanked out.
  const BARE = /\bprocess\s*\.|\brequire\s*\(/;
  for (const d of pureDirs) {
    for (const file of collectSources(join(repoRoot, d))) {
      if (isNodeOnlyAllowed(file)) continue;
      const stripped = stripCommentsAndStrings(readFileSync(file, "utf8"));
      const m = BARE.exec(stripped);
      if (m) violations.push(`${rel(file)}:${lineOf(stripped, m.index)}  ${m[0].trim()}`);
    }
  }
  assert.equal(
    violations.length,
    0,
    `pure packages must not use bare process.* or require( — they must run in the browser:\n  ${violations.join("\n  ")}`,
  );
});

// ── Invariant #3: the Anthropic secret never reaches the browser ────────────────────────────────
//
// apps/web/src is the browser bundle. It POSTs to the service; it never names the key. (The literal
// forms below are the ways a leak would show up: the env var names, or an api_key/apiKey binding.)
test("invariant #3: apps/web/src never references the Anthropic API key", () => {
  const SECRET = /\bKILN_ANTHROPIC_API_KEY\b|\bANTHROPIC_API_KEY\b|\bapi_?[Kk]ey\b/;
  const violations: string[] = [];
  for (const file of collectSources(join(repoRoot, "apps/web/src"))) {
    const src = readFileSync(file, "utf8");
    const m = SECRET.exec(src);
    if (m) violations.push(`${rel(file)}:${lineOf(src, m.index)}  ${m[0]}`);
  }
  assert.equal(
    violations.length,
    0,
    `the Anthropic key lives only in apps/service — the web bundle must never name it:\n  ${violations.join("\n  ")}`,
  );
});
