/**
 * @kiln/ir — the Intermediate Representation (IR): the spine of Kiln.
 *
 * SPEC-001 §3.4. Every UI view and every validator reads the IR, never raw YAML.
 * The IR is a typed graph (a business is not a tree). Every node/edge is tagged
 * `authored` (round-trips to source text) or `derived` (read-only projection) so the
 * "text is the source of truth" invariant is enforceable by construction (SPEC-001 §3.3).
 */

/**
 * MODEL_SCHEMA_VERSION — the compatibility version of the model.json / IR shape.
 *
 * The exported model.json (and the IR it materializes) is a contract that generated apps and the
 * `--since` incremental-migration generator depend on. This constant makes that contract explicit
 * so consumers can detect a shape they cannot read.
 *
 * Semver meaning for THIS constant:
 * - **MINOR** bump: additive, backward-compatible model fields (a new optional layer/attribute).
 *   Older readers keep working; new fields are simply absent in old documents.
 * - **MAJOR** bump: a breaking change to the model shape — a removed/renamed/retyped field, or any
 *   change that would require MIGRATING already-exported model.json files before they load.
 * - PATCH: reserved (documentation-only / non-shape clarifications).
 *
 * Not yet wired into serialization — this establishes the constant and its meaning only.
 */
export const MODEL_SCHEMA_VERSION = "1.0.0";

export type NodeType =
  | "capability"
  | "actor"
  | "outcome"
  | "domain_object"
  | "aggregate" // SPEC-002: an entity a capability owns
  | "bounded_context"
  | "command" // SPEC-004: an action that changes an aggregate
  | "event" // SPEC-004: a fact that resulted
  | "policy" // SPEC-005: a reaction rule (on event → then command)
  | "role" // SPEC-006: an authorized persona
  | "workflow" // SPEC-007: a named multi-step process
  | "agent" // SPEC-008: an autonomous operator
  | "tool"; // SPEC-013: an authored connector (grant-surface metadata only)

export type EdgeType =
  | "produces"
  | "consumes"
  | "depends_on"
  | "owns" // capability → aggregate (SPEC-002)
  | "references" // aggregate → aggregate (SPEC-002: shared entities)
  | "serves"
  | "groups"
  | "issues" // capability → command (SPEC-004)
  | "changes" // command → aggregate (SPEC-004)
  | "emits" // command → event (SPEC-004)
  | "on" // event → aggregate (SPEC-004)
  | "when" // event → policy (SPEC-005: the trigger)
  | "then" // policy → command (SPEC-005: the reaction)
  | "authorizes" // role → capability (SPEC-006)
  | "step" // workflow → command (SPEC-007: an ordered step)
  | "operates" // agent → capability (SPEC-008)
  | "grants"; // agent → tool (SPEC-013: a per-op connector grant; op is encoded in the edge id)

/** authored = editable, round-trips to text; derived = read-only projection. */
export type Origin = "authored" | "derived";

/** Provenance back to the authored source (heading path + content hash, not line numbers). */
export interface SourceRef {
  file: string;
  section: string;
  anchor: string;
  contentHash: string;
}

export interface IRNode {
  id: string;
  type: NodeType;
  origin: Origin;
  label: string;
  source?: SourceRef;
  meta: Record<string, unknown>;
}

export interface IREdge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  origin: Origin;
}

export interface IR {
  version: string;
  domain: string;
  nodes: IRNode[];
  edges: IREdge[];
  /** hash(authored input ⊕ compilerVersion ⊕ schemaVersion) — SPEC-001 §3.4. */
  buildHash: string;
}

// Standard SHA-256, isomorphic (Node + browser): uses only TextEncoder + DataView, no
// node:crypto — so @kiln/ir and everything built on it runs client-side (ADR-003 §4).
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256(input: string): string {
  const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));
  const msg = new TextEncoder().encode(input);
  const bitLen = msg.length * 8;
  const withOne = msg.length + 1;
  const pad = (56 - (withOne % 64) + 64) % 64;
  const total = withOne + pad + 8;
  const buf = new Uint8Array(total);
  buf.set(msg, 0);
  buf[msg.length] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(bitLen / 0x100000000), false);
  dv.setUint32(total - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + SHA256_K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }

  const hex = (x: number): string => (x >>> 0).toString(16).padStart(8, "0");
  return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4) + hex(h5) + hex(h6) + hex(h7);
}

/** Deterministic, key-order-independent stringify — the basis of a stable buildHash. */
export function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys(obj[k]);
        return acc;
      }, {});
  }
  return v;
}

/** Stable slug for deriving node ids from human labels. */
export function slug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    // The collapse above leaves at most a single leading/trailing "_", so match one (not "_+") —
    // provably linear, identical output, and free of the polynomial-backtracking CodeQL flags.
    .replace(/^_/, "")
    .replace(/_$/, "");
}

/** Deterministic, human-readable edge id (REV-002 residual: canonical edge identity). */
export function edgeId(from: string, to: string, type: EdgeType): string {
  return `${from}--${type}-->${to}`;
}
