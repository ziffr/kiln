/**
 * Model catalog for the in-app selector (ADR-004). Effort support is per-model:
 * `output_config.effort` is GA on Sonnet 5 / Opus 4.x but ERRORS on Haiku 4.5 — so effort
 * must be coupled to the chosen model (claude-api skill, Thinking & Effort).
 */

export interface ModelOption {
  id: string;
  label: string;
  supportsEffort: boolean;
}

export const MODELS: ModelOption[] = [
  { id: "claude-sonnet-5", label: "Sonnet 5", supportsEffort: true },
  { id: "claude-opus-4-8", label: "Opus 4.8", supportsEffort: true },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", supportsEffort: false },
];

export const EFFORTS = ["low", "medium", "high", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

// "sonnet medium" — the requested default.
export const DEFAULT_MODEL = "claude-sonnet-5";
export const DEFAULT_EFFORT: Effort = "medium";

export function modelById(id: string): ModelOption | undefined {
  return MODELS.find((m) => m.id === id);
}
