/**
 * Studio lock (client side). When a hosted, keyed Kiln sets `KILN_STUDIO_TOKEN`, its `/api` endpoints
 * return `401 {locked:true}` unless the request carries a matching `x-kiln-token` header. This wraps
 * `window.fetch` to (a) attach the stored passphrase to same-origin `/api` calls, and (b) signal the app
 * (via a `kiln:studio-locked` event) to ask for it when the studio is locked — the app shows its own modal
 * (no native prompt). On the public keyless demo and in local dev there's no token to send — a no-op.
 */
export const STUDIO_TOKEN_KEY = "kiln.studioToken";
const KEY = STUDIO_TOKEN_KEY;
const orig = window.fetch.bind(window);

window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const isApi = url.includes("/api/");
  if (isApi) {
    const tok = localStorage.getItem(KEY);
    if (tok) {
      init = { ...init, headers: { ...(init?.headers as Record<string, string> | undefined), "x-kiln-token": tok } };
    }
  }
  const res = await orig(input as RequestInfo, init);
  if (isApi && res.status === 401) {
    const body = await res.clone().json().catch(() => null);
    if (body && (body as { locked?: boolean }).locked) {
      // A stored token that still gets 401 was rejected — drop it so the app re-asks.
      if (localStorage.getItem(KEY)) localStorage.removeItem(KEY);
      window.dispatchEvent(new CustomEvent("kiln:studio-locked"));
    }
  }
  return res;
};

export {};
