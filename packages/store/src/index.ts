/**
 * @vbd/store — the `.vbd/` derived cache with buildHash-on-load (ADR-002, SPEC-001 §3.4).
 *
 * Invariant: authored artifacts are the source of truth; `.vbd/` is a rebuildable cache that
 * is NEVER an input. On load we verify the cached IR's buildHash against a freshly computed
 * hash of the authored doc; on any mismatch or corruption we discard the cache and recompile.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { IR } from "@vbd/ir";
import {
  compileCapabilities,
  computeBuildHash,
  COMPILER_VERSION,
  SCHEMA_VERSION,
  type CapabilityDoc,
} from "@vbd/compiler";

export const VBD_DIR = ".vbd";

export interface BuildMeta {
  buildHash: string;
  compilerVersion: string;
  schemaVersion: string;
}

export interface LoadResult {
  ir: IR;
  fromCache: boolean;
}

/** Load the IR for a workspace, using the `.vbd/` cache iff its buildHash matches. */
export function loadIR(workspaceDir: string, doc: CapabilityDoc): LoadResult {
  const cacheDir = join(workspaceDir, VBD_DIR);
  const irPath = join(cacheDir, "ir.json");
  const metaPath = join(cacheDir, "build.meta.json");
  const expected = computeBuildHash(doc);

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

  const ir = compileCapabilities(doc);
  writeCache(cacheDir, ir);
  return { ir, fromCache: false };
}

/** Whether the cache is present and matches the given authored doc (drift/dirty signal). */
export function isCacheFresh(workspaceDir: string, doc: CapabilityDoc): boolean {
  const metaPath = join(workspaceDir, VBD_DIR, "build.meta.json");
  if (!existsSync(metaPath)) return false;
  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as BuildMeta;
    return meta.buildHash === computeBuildHash(doc);
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
