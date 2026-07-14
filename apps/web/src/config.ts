/**
 * Where the browser sends its API calls.
 * - Production (Vercel): same-origin — the `/api/*` serverless functions. `SERVICE_URL` is "".
 * - Dev: the standalone Node service on :8787 (loaded from the gitignored root .env).
 * Override anytime with `VITE_SERVICE_URL`. The Anthropic key stays server-side either way.
 */
export const SERVICE_URL =
  (import.meta.env.VITE_SERVICE_URL as string | undefined) ??
  (import.meta.env.DEV ? "http://localhost:8787" : "");

/**
 * The external documentation site (Docusaurus on GitHub Pages). The in-app "Documentation" links point
 * here. Override with `VITE_DOCS_URL` — e.g. a custom domain once one is set up.
 */
export const DOCS_URL = (import.meta.env.VITE_DOCS_URL as string | undefined) ?? "https://ziffr.github.io/kiln/";
