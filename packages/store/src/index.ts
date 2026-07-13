/**
 * @kiln/store — the `.kiln/` derived cache with buildHash-on-load (ADR-002, SPEC-001 §3.4).
 *
 * Invariant: authored artifacts are the source of truth; `.kiln/` is a rebuildable cache that
 * is NEVER an input. On load we verify the cached IR's buildHash against a freshly computed
 * hash of the authored doc; on any mismatch or corruption we discard the cache and recompile.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { IR } from "@kiln/ir";
import {
  compileCapabilities,
  computeBuildHash,
  COMPILER_VERSION,
  SCHEMA_VERSION,
  type CapabilityDoc,
  type DomainDoc,
  type ContextsDoc,
} from "@kiln/compiler";

export const KILN_DIR = ".kiln";

export interface BuildMeta {
  buildHash: string;
  compilerVersion: string;
  schemaVersion: string;
}

export interface LoadResult {
  ir: IR;
  fromCache: boolean;
}

/**
 * Load the IR for a workspace, using the `.kiln/` cache iff its buildHash matches. The domain
 * (SPEC-002/004) and contexts (SPEC-003) artifacts must enter the hash + IR too, else edits to
 * entities/behaviour/areas can't invalidate the cache (REV-015 M3 / REV-020 M4).
 */
export function loadIR(workspaceDir: string, doc: CapabilityDoc, domain?: DomainDoc, contexts?: ContextsDoc): LoadResult {
  const cacheDir = join(workspaceDir, KILN_DIR);
  const irPath = join(cacheDir, "ir.json");
  const metaPath = join(cacheDir, "build.meta.json");
  const expected = computeBuildHash(doc, domain, contexts);

  if (existsSync(irPath) && existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf8")) as BuildMeta;
      const ir = JSON.parse(readFileSync(irPath, "utf8")) as IR;
      if (meta.buildHash === expected && ir.buildHash === expected) {
        return { ir, fromCache: true };
      }
    } catch {
      // corrupt cache → fall through to recompile
    }
  }

  const ir = compileCapabilities(doc, domain, contexts);
  writeCache(cacheDir, ir);
  return { ir, fromCache: false };
}

/** Whether the cache is present and matches the given authored artifacts (drift/dirty signal). */
export function isCacheFresh(workspaceDir: string, doc: CapabilityDoc, domain?: DomainDoc, contexts?: ContextsDoc): boolean {
  const metaPath = join(workspaceDir, KILN_DIR, "build.meta.json");
  if (!existsSync(metaPath)) return false;
  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as BuildMeta;
    return meta.buildHash === computeBuildHash(doc, domain, contexts);
  } catch {
    return false;
  }
}

function writeCache(cacheDir: string, ir: IR): void {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(join(cacheDir, "ir.json"), `${JSON.stringify(ir, null, 2)}\n`);
  const meta: BuildMeta = {
    buildHash: ir.buildHash,
    compilerVersion: COMPILER_VERSION,
    schemaVersion: SCHEMA_VERSION,
  };
  writeFileSync(join(cacheDir, "build.meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
}
