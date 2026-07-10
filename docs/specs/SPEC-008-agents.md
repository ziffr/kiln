---
id: SPEC-008
title: Agents — autonomous operators
type: spec
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-10
updated: 2026-07-10
related: [SPEC-001, SPEC-006, SPEC-007]
reviewers: []
---

# SPEC-008 — Agents

The methodology's `agent_model`: autonomous operators, each with a GOAL, that run a set of
capabilities (a "Sales Agent", "Dispatch Coordinator"). Plus the codegen END of the pipeline.

- **IR:** `agent` node (goal in meta) + `operates` edges → capabilities.
- **Validators (`validateAgents`):** AG1 required, AG2 capability-exists (repair-triggering), AG3
  slug/unique, AG4 grounded provenance, AG5 empty-agent.
- **Skill:** `mockGenerateAgents` + `AgentModeler` (goal + capability tools, canonicalized) + `/api/agents`.
- **Eval:** seeded-defect recall + capability-coverage.
- **Codegen:** `generateAgentConfig` (agent goal + capability tools). And the pipeline's code end:
  `generateApplicationBlueprint` (screens per area/entity), `generateImplementationBlueprint` (a
  service per area), plus the EXECUTION targets `generateMcpTools` (commands → MCP tools) and
  `generateReactApp` (routed component scaffold). Remaining work is deliberately HAND-OWNED (ADR-002):
  vertical adapters (Odoo/OpenSolar) and business logic.
- **UI:** "Generate agents" button; findings; Agents/App/Deploy/MCP/React tabs in View-code (12 tabs).

Verified end-to-end against Sonnet (Sales/Field-Ops/Billing agents). **Approved.** The full
methodology stack (narrative → … → agents → blueprints → code) is now built.
