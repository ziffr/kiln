/** @kiln/eval — ROLE (permissions) evaluation (SPEC-006). Defect detection + authorization coverage. */

import type { CapabilityDoc, RolesDoc } from "@kiln/compiler";
import { validateRoles, type Finding } from "@kiln/validation";
import type { ExpectedDefect } from "./index.ts";

export interface RolesEvalCase {
  id: string;
  description: string;
  roles: RolesDoc;
  capabilityIds: string[];
  expected: ExpectedDefect[];
}
export interface RolesCaseScore { id: string; matched: number; expectedCount: number; foundCount: number; precision: number; unmet: ExpectedDefect[] }

const matches = (e: ExpectedDefect, f: Finding): boolean => f.code === e.code && (e.subject ? f.subjects.includes(e.subject) : true);
export function scoreRolesCase(c: RolesEvalCase): RolesCaseScore {
  const findings = validateRoles(c.roles, c.capabilityIds);
  const unmet = c.expected.filter((e) => !findings.some((f) => matches(e, f)));
  const relevant = findings.filter((f) => c.expected.some((e) => matches(e, f)));
  return { id: c.id, matched: c.expected.length - unmet.length, expectedCount: c.expected.length, foundCount: findings.length, precision: findings.length ? relevant.length / findings.length : 1, unmet };
}
export function aggregateRolesRecall(scores: RolesCaseScore[]): number {
  const total = scores.reduce((a, s) => a + s.expectedCount, 0);
  const hit = scores.reduce((a, s) => a + s.matched, 0);
  return total ? hit / total : 1;
}

export interface RoleCoverage {
  authorizationCompleteness: number; // capabilities authorized by ≥1 role / total
  provenanceRate: number;
  roleCount: number;
  unauthorized: string[];
}
const isGrounded = (meta: unknown): boolean => {
  const m = (meta ?? {}) as Record<string, unknown>;
  if (m.origin === "authored") return true;
  const d = m.derivedFrom;
  return Array.isArray(d) && d.some((x) => typeof (x as Record<string, unknown>)?.anchor === "string" && ((x as Record<string, unknown>).anchor as string).trim());
};
export function scoreRoleCoverage(caps: CapabilityDoc, roles: RolesDoc): RoleCoverage {
  const capIds = caps.capabilities.map((c) => c.id);
  const authorized = new Set(roles.roles.flatMap((r) => r.capabilities ?? []));
  const unauthorized = capIds.filter((id) => !authorized.has(id));
  const grounded = roles.roles.filter((r) => isGrounded(r.meta)).length;
  return {
    authorizationCompleteness: capIds.length ? (capIds.length - unauthorized.length) / capIds.length : 1,
    provenanceRate: roles.roles.length ? grounded / roles.roles.length : 1,
    roleCount: roles.roles.length,
    unauthorized,
  };
}
