# Roadmap

A living, directional view of where Kiln is headed — not a dated commitment. It follows the
[vision](VISION.md): Kiln is the design-time surface that compiles a *distributed* business landscape
from a description, and the model stays the single source of truth. Sizes are rough (S / M / L / XL).

> **🗳️ Vote & comment:** every item below is an open post in
> [Discussions → 🗺️ Roadmap](https://github.com/ziffr/kiln/discussions/categories/ideas). **👍 the
> ones you want** and comment to shape them — items with traction graduate to `roadmap` issues and get
> built.

## Recently shipped

- The full modeling arc: narrative → capabilities → business areas → entities → behaviour →
  automations → roles → workflows → agents → **code**.
- Multi-backend codegen through a **plugin seam** (Postgres, SQLite, n8n, Odoo, a Node spine, a
  shadcn UI, Langdock, Anthropic Managed Agents).
- Enrichment, a findings system (severity · remediation · ignore), per-layer **AI review**, and the
  workflow-vs-agent-vs-external **orchestration router**.
- **Versioned workspaces** (SPEC-011): git-backed history, restore, semantic diff, and labelled
  "Save version" checkpoints.

## Now → Next (recommended sequence)

The next three, in order — each is high-leverage and reuses what's already built:

1. **Live generated-app preview** *(S–M)* — render the generated UI inside Studio, so you *see* the
   running app (the matters list, the intake form, the deadline board), not just its code. Makes the
   compile tangible.
2. **Version-diff → live migration** *(M)* — feed the semantic diff engine into the existing Postgres
   migration generator: "what changed between v3 and v5" becomes the SQL to evolve a *live* database.
   Closes the loop between version control and deployment.
3. **Tenancy + real auth/RLS** *(L)* — replace the generated `USING(true)` with a subject/tenant
   model. This is what turns the output from a scaffold into something genuinely deployable.

## The full menu, by theme

### 1. See & trust the compile
- Live generated-app preview *(S–M)* — see the running app in Studio.
- Version-diff → live migration *(M)* — grow a live database from a version diff.
- Provenance surfacing *(S)* — click any generated artifact → the narrative sentence it came from.

### 2. Make the generated system production-real
- Tenancy + real auth/RLS *(L)* — the #1 deploy-hardening gap.
- Observability *(M)* — structured logs / traces / health in generated apps.

### 3. Model better with the LLM (the design-time moat)
- Semantic critic loop *(M–L)* — LLM self-critique across every layer + a Review→Refine→closure
  dashboard.
- Conversational model editing *(M)* — "make offers expire in 14 days" → the LLM patches the right
  layer, validated.
- In-app editing for the execution layers *(S–M)* — comms / integrations / binding / theme are
  currently editable only via the model.json.

### 4. The runtime surface (the vision's second product)
- One-click deploy the compiled landscape *(L)* — from "here's the zip" to "provisioned and running."
- **Runtime control plane** *(XL)* — one pane over the *running* distributed system (the agents here,
  the workflows there, the data everywhere). A deliberate second product to design toward, not a
  footnote.

### 5. Community & ecosystem
- More engines via the plugin seam *(S each)* — MySQL, Temporal, Supabase, Airflow, … — ideal
  first contributions (see [DEVELOPER.md](DEVELOPER.md) and the new-engine issue template).
- Team / multi-user workspaces *(L)*.
- Hosted-studio version control *(M)* — a DB-backed history so versioning also works on the serverless
  hosted studio (today it needs the persistent backend).

## How this roadmap is set

Kiln is maintained by a non-technical **Product Owner** (vision + priorities) and an **AI Maintainer**
(all technical work) — see [GOVERNANCE.md](GOVERNANCE.md). Priorities shift with what real use
teaches us. If an item matters to you, open a **GitHub Discussion** — that's the fastest way to move
it up.
