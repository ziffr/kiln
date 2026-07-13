---
id: RES-003
title: Agent- & workflow-runtime provider landscape — codegen-fit scoring
type: research
status: Draft
version: 0.1.0
author: Claude (Opus 4.8)
created: 2026-07-13
updated: 2026-07-13
supersedes: null
related: [RES-002, SPEC-010]
---

# RES-003 — Agent- & workflow-runtime provider landscape

## 1. The question

Which agent-runtime and workflow-runtime providers can Kiln add via the SPEC-010 engine seam, and
which can it only *integrate* (webhook edge)? The deciding criterion, established while adding Langdock:

> **A provider is a codegen target iff Kiln can generate an importable/creatable definition for it.**
> n8n (importable workflow JSON) qualifies; a purely visual builder does not.

This note web-researched the *current* create/import surface of the main candidates (July 2026) so the
scoring reflects reality, not stale priors.

## 2. Findings — workflow runtimes (fill `react`/`sequence`, like n8n)

| Provider | Definition surface (verified) | Codegen target? | Host | Notes |
|---|---|---|---|---|
| **n8n** *(shipped)* | importable workflow JSON | ✅ | self/cloud | current engine |
| **Activepieces** | Flow Management API + IMPORT_FLOW; flows export/import as JSON (zip of `.json`) | ✅ strong | self/cloud (OSS) | closest n8n sibling — real import API |
| **Windmill** | flows as YAML/JSON, `wmill flow push path/flow.yaml f/flows/x` (CLI over an API) | ✅ strong | self/cloud (OSS) | developer-leaning, very fast engine |
| **Make (Integromat)** | scenario "blueprints" (JSON), import | ✅ | SaaS | closed SaaS |
| **AWS Step Functions / Azure Logic Apps / GCP Workflows** | ASL JSON / JSON / YAML | ✅ | cloud-locked | infra-as-code targets |
| **Temporal / Trigger.dev** | workflows **as code** | ✅ (emit code) | self/cloud | durable/reliable; different modality |
| **Zapier** | **`POST /v2/zaps`** with `{steps,title}` (`zap:write`) — exists, but the Workflow/Partner API is **gated to Zapier Platform partners with a published integration** | ⚠️ partner-gated | SaaS | **update to earlier advice** — see §4 |
| **IFTTT** | no importable applet-definition API; Webhooks (Maker) trigger only | ❌ | SaaS | too consumer-grade |

## 3. Findings — agent runtimes (fill the app-level `agentRuntime`, like Node/Langdock/Managed-Agents)

| Provider | Create surface (verified) | Fit | Notes |
|---|---|---|---|
| **Anthropic Managed Agents** *(shipped)* | `POST /v1/agents` + Sessions | ✅ provision | first-party, best Claude fidelity |
| **Langdock** *(shipped)* | Agent API create + chat/completions | ✅ provision | EU-resident governed gateway |
| **OpenAI** | **Assistants API is deprecating (sunset Aug 2026)**; the current path is the **Responses API + Agents SDK** — agents are now **code** (`Agent(name, instructions, tools)`), not a persisted create-once object | ✅ (emit code) | **update** — target the Agents SDK, not Assistants |
| **AWS Bedrock Agents / Vertex Agent Builder / Azure AI Agent Service** | API / IaC create | ✅ provision | cloud-native |
| **Dify** | app **DSL YAML** export/import | ✅ provision | OSS, self-host, visual |
| **LangGraph / CrewAI / Mastra** | code frameworks | ✅ (emit code) | Kiln's Node runtime already *is* this category |

## 4. What changed vs the earlier (Langdock-era) advice

1. **Zapier is *partially* a codegen target now.** A `POST /v2/zaps` Workflow API exists (create a Zap
   from `{steps,title}`, `zap:write` scope) — but it's **restricted to Zapier Platform partners with a
   published public integration**, not open to arbitrary accounts. So for *generated apps* it remains
   impractical as an engine; the **webhook-edge integration is the right default** (shipped: Zapier as an
   integration transport — event → Catch Hook out, Zap → command in). Revisit engine-mode only if Kiln
   itself becomes a Zapier Platform partner.
2. **OpenAI Assistants is sunsetting (Aug 2026).** If/when an OpenAI agent runtime is added, target the
   **Agents SDK + Responses API** (emit code, like the Node runtime), not the Assistants create API.
3. **IFTTT stays out** — no importable definition, consumer-grade.

## 5. Recommendation (unchanged in direction, sharper in detail)

- **Next workflow engine:** **Activepieces** or **Windmill** — both are true codegen targets (importable
  flow definitions), open-source, self-hostable. Activepieces is the closest n8n analog (import API);
  Windmill if you want a code-first, high-performance engine. Either validates the seam against a genuinely
  different backend and gives users a self-owned n8n alternative.
- **Agent runtimes:** Managed Agents (shipped) + Langdock (shipped) cover first-party + EU-governed. Add a
  cloud one (Bedrock/Vertex) only when a customer needs that cloud; Dify if a self-hosted visual agent
  platform is wanted.
- **Zapier/IFTTT:** integration layer, not engines (Zapier shipped; IFTTT skip).

## Sources
Activepieces flow API/import: activepieces.com/docs/endpoints/flows + community import/export threads.
Windmill flows-as-code + `wmill flow push`: windmill.dev/docs (workflows_as_code, cli/flow).
OpenAI Assistants deprecation + Agents SDK: developers.openai.com/api/docs/guides/agents, openai.com AgentKit/Responses posts.
Zapier `POST /v2/zaps` + partner gating: docs.zapier.com/powered-by-zapier/api-reference/zaps/create-a-zap.
