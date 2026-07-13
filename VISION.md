# Vision

The software that runs a business is no longer one platform — it's a distributed landscape of
databases, automations, agents, and services that someone has to hold together. Kiln lets you design
that whole landscape by describing your business in plain words, and compiles it into a coherent,
integrated scaffold you fully own — every component and its connections in place, ready for a
developer or an LLM to complete. Your description is the single source of truth; the machine
proposes, and you decide.

> **Kiln exists so that any business can design, own, and evolve the software landscape that runs it — by describing it in plain words.**

## The manifesto

Every business is now a software business. But the people who understand the business least
understand the software, and the people who build the software least understand the business. In
between sits a translation layer — quarters of requirements, integration projects, consultants —
that most businesses can't afford and none of them enjoy. So they surrender: they buy a monolith,
and let one platform's idea of how a business *should* work overwrite how theirs actually does.

We think that trade is over.

The future business doesn't run on one central platform. It runs on a landscape — agents reasoning
in one place, workflows executing in another, data living wherever it belongs, services from a dozen
vendors — and the hard part was never any single piece. It was keeping the whole thing coherent.
Today that coherence is bought with endless hand-integration. **Kiln makes coherence a property of
the design itself.**

You describe your business in your own language. Kiln compiles that description — layer by layer,
capabilities to data to behavior to people to processes — into a formal model, checks it, and
projects it into a real, distributed, integrated landscape: the databases, the automations, the
agents, the APIs, and the wiring between them — the working skeleton of the whole system, ready for a
developer or a downstream LLM to complete with the specifics: the calculations, the data
transformations, the edge cases. The description is the source of truth. The picture, the code, the
whole landscape are projections of it — so when the business changes, you change the
words, and the landscape recompiles. Nothing is frozen. Nothing is a black box. **The machine
proposes; the validators and the human decide.**

The end state we are building toward: a business owner — not a developer — sits down, describes what
their company does, and walks away with a coherent software landscape they fully understand and
completely own. No monolith dictating their process. No integration project standing between them
and their own operations. A living design they can read, question, hand to a developer, regenerate,
and grow — for a solo founder or a factory floor, in any industry, in any language.

That is a great deal of software for the world to build. It is far too much for us. It is exactly the
right amount for a community.

## Positioning — why this is different

> **For** business owners and the developers who serve them, **who** need real software to run a
> distributed operation but can't afford to hand-build it or hand-integrate it, **Kiln is a business
> compiler**: you describe the business in plain words, and it compiles the entire software landscape
> — the data, the workflows, the agents, the APIs, and the integration between them — as a coherent
> scaffold ready to complete. **Unlike** app builders and AI
> code generators, where the *code* becomes the source of truth and immediately drifts, and **unlike**
> ERPs, where one platform dictates how you must work, **Kiln keeps your description as the single
> source of truth** and projects it into a distributed, best-of-breed landscape you fully own —
> coherent by construction, regenerated rather than maintained.

**Not an app builder. Not a code generator. Not a platform. Kiln is a compiler for the whole business
landscape.**

Everyone else in this new world optimizes one corner and leaves the source of truth in the wrong
place. Kiln moves it:

- **vs. ERPs / monoliths** — they buy coherence through *centralization*: one platform's data model,
  one vendor, one opinion about how your business should work. Kiln buys coherence through
  *compilation*: your model, projected onto any platforms you choose.
- **vs. low-code / app builders** — the *app* is the artifact you own and maintain forever, screen by
  screen. In Kiln the *model* is the artifact; the app is disposable output you can throw away and
  regenerate.
- **vs. AI code generators ("vibe coding")** — they generate code from a prompt, and the code
  instantly becomes the truth: unvalidated, drifting, a black box, and only ever *one app*. Kiln
  generates from a *validated model that stays the truth* — reviewable, regenerable, and producing a
  whole coordinated landscape, not a single app.
- **vs. integration platforms (iPaaS)** — they let you hand-wire existing tools together; the
  integration is the artifact. Kiln *generates* the integration from one model, so wiring is a
  consequence of the design, not a project of its own.
- **vs. enterprise-architecture / modeling tools** — they model the landscape into diagrams that rot,
  disconnected from anything running. Kiln's model *is the build*: it validates, it projects, it runs.

**Where the line is.** Kiln compiles the *skeleton* of the landscape — the structure, the contracts,
and the integration — not the last mile of specific business logic. Calculations, data
transformations, and edge cases are completed by a developer or a downstream LLM. We are not trying
to be an ERP and a low-code builder rolled into one, finishing everything at the press of a button.
The promise is different, and better: every project starts from a correct, coherent, fully-owned
design of the whole landscape — instead of a blank page, or someone else's monolith.

**Why now.** Generating software is on its way to free — agents, workflows, and code can be spun up
anywhere, by anyone, in seconds. When *building* stops being the bottleneck, the bottleneck moves to
**coherence, ownership, and governance of a sprawling, generated, distributed landscape** — and none
of today's tools were built for that. Kiln is. It isn't another generator racing to emit more code;
it's the **source-of-truth and coherence layer over the generation** — the thing that decides which
parts of a business are agents, which are workflows, which are data, and keeps them one system a
human still understands and owns. In an agentic world the winning primitive isn't *an agent*. It's
the **model that governs the whole landscape**.

## The principles we build by

These aren't slogans — they're the invariants already in the code (see
[CONTRIBUTING.md](CONTRIBUTING.md) and [CLAUDE.md](CLAUDE.md)), stated as the values a contributor
signs up to:

1. **The description is the truth; everything else is a projection.** Never store truth in the canvas
   or the code. Fix the model, and the world updates.
2. **No privileged platform.** Every engine — a database, an orchestrator, an agent runtime, a UI —
   is an equal, pluggable citizen. Distribution is the default, not the exception.
3. **The human is always in charge.** AI proposes; deterministic validators and a person dispose.
   Every generated thing is a reviewable, editable draft.
4. **Coherence by construction.** Integration is generated from one model, not wired by hand — so a
   distributed landscape never decays into chaos.
5. **Accessible by design.** If a business owner can describe it, they can build it. Plain language
   in, real systems out.

## The invitation

Kiln is maintained in the open and built to be extended: a new backend, a new agent runtime, a new
methodology layer, a new industry — each is a contribution the whole landscape inherits. If you
believe businesses should own the software that runs them, there's a seam here with your name on it.
Start with [DEVELOPER.md](DEVELOPER.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

**Describe a business. Compile a landscape. Come build the compiler.**
