# Prompts — the editable system prompts for each generation layer

These `*.md` files are the **source of truth** for the system prompts that steer each LLM layer of the
Business Compiler. Edit them freely in any markdown editor — they are just text. This is where prompt
optimization happens: sharpen these to raise output quality across the whole stack.

## How it flows

```
prompts/<layer>.md   ──  npm run prompts:build  ──▶  src/prompts.generated.ts  ──▶  the skills import it
   (you edit this)          (embeds md → TS)            (generated; do not edit)      (isomorphic, no fs)
```

The embed step keeps the `@kiln/skills` package isomorphic (runs in Node **and** the browser, golden
invariant #4 — no `node:fs` at runtime) and build-step-free. Same "text is truth; the projection is
derived" stance as the product itself.

## Editing a prompt

1. Edit `prompts/<layer>.md` (leave the `---` frontmatter; only the body below it is the prompt).
2. Run `npm run prompts:build`.
3. `npm test` — generation tests should still pass (unless you intended a behavioural change).
4. Commit the `.md` **and** the regenerated `src/prompts.generated.ts`.

## Each file's frontmatter

- `id` — the prompt key (= filename).
- `title` — human label.
- `const` — the exported constant it backs (e.g. `DOMAIN_SYSTEM_PROMPT`), so you can trace it in code.

## Layers covered

| file | layer | endpoint |
|---|---|---|
| `capability.md` | Capability Map | `/api/generate` |
| `domain.md` | Domain model (entities) | `/api/domain` |
| `contexts.md` / `contexts-critique.md` | Business Areas | `/api/contexts` |
| `events.md` | Behaviour (commands & events) | `/api/events` |
| `policies.md` | Automations (reactions) | `/api/policies` |
| `roles.md` | Roles | `/api/roles` |
| `workflows.md` | Workflows | `/api/workflows` |
| `agents.md` | Agents | `/api/agents` |
| `app-logic.md` | App logic (handler bodies) | `/api/app-logic` |
| `components.md` | App components (views) | `/api/app-components` |

## Not yet externalized

Prompts assembled dynamically in code (parameterized by a lens or built from parts) remain in their
`.ts` for now: `CODE_REVIEW_SYSTEM_PROMPT` (per-lens), and the NarrativeCoach / semantic-critic prompts.
They can be templated into markdown later with a placeholder convention if desired.
