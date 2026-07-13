/**
 * LLM skill runtime contracts (ADR-004; SPEC-001 §4).
 * Skills depend on the provider INTERFACE, never a vendor SDK.
 */

import type { CapabilityDoc } from "@kiln/compiler";
import type { Finding } from "@kiln/validation";

export interface LlmRequest {
  system: string;
  user: string;
  /** JSON Schema the output must satisfy (advisory to the provider; enforced by us). */
  schema?: unknown;
  /** Structured context for deterministic/mock providers (not sent to a real model verbatim). */
  context?: unknown;
}

export interface LlmResult {
  json: unknown;
  raw: string;
  provider: string;
}

export interface LlmProvider {
  readonly name: string;
  complete(req: LlmRequest): Promise<LlmResult>;
}

export interface GenerationResult {
  doc: CapabilityDoc;
  findings: Finding[];
  provider: string;
  /** true if a repair retry was needed (SPEC-001 §4.4). */
  repaired: boolean;
}
