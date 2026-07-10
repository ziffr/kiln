---
id: SPEC-007
title: Workflows — end-to-end multi-step processes
type: spec
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-10
updated: 2026-07-10
related: [SPEC-004, SPEC-005]
reviewers: []
---

# SPEC-007 — Workflows

The methodology's `workflow_model`: named end-to-end processes, each an ORDERED sequence of existing
commands (Order-to-Cash, Onboarding). Built on the proven layer pattern.

- **IR:** `workflow` node (ordered `steps` in meta) + `step` edges → commands.
- **Validators (`validateWorkflows`):** WF1 required, WF2 step-command-exists (repair-triggering),
  WF3 slug/unique, WF4 grounded provenance, WF5 min-2-steps.
- **Skill:** `mockGenerateWorkflows` + `WorkflowModeler` (ordered command sequences, canonicalized by
  id/name, repair on WF2) + `/api/workflows`.
- **Eval:** seeded-defect recall + step-coverage.
- **Codegen:** `generateProcesses` → an orchestration step-runner per workflow.
- **UI:** "Generate workflows" button; findings; Processes tab in View-code.

Verified: 176 tests; mock + LLM produce valid ordered processes. **Approved.**
