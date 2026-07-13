# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities **privately** — do not open a public issue for anything that
could put users at risk.

Preferred: use **[GitHub private security advisories](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)**
("Report a vulnerability" under the repository's **Security** tab). This keeps the report and the
coordinated fix private until a patch is available.

Alternatively, email **stefan@sonntag-online.com** with the details.

Please include enough to reproduce: affected component, version/commit, and a proof of concept if
you have one. We will acknowledge your report, work with you on a fix, and credit you (unless you
prefer to remain anonymous).

## Supported versions

Only the **latest release** is supported with security fixes. Please upgrade before reporting an
issue against an older version.

| Version        | Supported |
| -------------- | --------- |
| Latest release | ✅        |
| Older releases | ❌        |

## Sensitive surface — what to know

VBD has a few security-relevant areas. Contributors and deployers should keep these in mind:

- **The Anthropic API key is server-side only.** `VBD_ANTHROPIC_API_KEY` is read by `apps/service`
  (and the serverless functions in the deployed web app). It lives in a git-ignored root `.env` and
  **must never be committed** or exposed to the browser. The web app POSTs to the service; it never
  holds the key. If you ever see a path where the key could reach the client, treat it as a
  vulnerability and report it.

- **Generated apps ship with auth OFF by default.** A system exported by VBD's codegen does **not**
  enforce API authentication out of the box — auth is **opt-in** via an `API_TOKEN`. Likewise, the
  generated Postgres Row-Level Security policies are permissive (`USING (true)`) as a scaffold, not a
  production control. **Deployers are responsible for hardening a generated app before exposing it**:
  set `API_TOKEN`, tighten RLS, and add input validation and observability. See the generated repo's
  `DEPLOY.md`/`CLAUDE.md` for specifics.

- **Business/user text is treated as data.** LLM prompts wrap user-supplied text as data and use
  structured outputs to reduce prompt-injection risk. Preserve this pattern when touching prompt
  code.

If you are unsure whether something is a security issue, err on the side of reporting it privately.
