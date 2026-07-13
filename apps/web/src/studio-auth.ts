/**
 * Studio lock (client side). When a hosted, keyed Kiln sets `KILN_STUDIO_TOKEN`, its `/api` endpoints
 * return `401 {locked:true}` unless the request carries a matching `x-kiln-token` header. This wraps
 * `window.fetch` to (a) attach the stored passphrase to same-origin `/api` calls, and (b) prompt for it
 * once when the studio is locked. On the public keyless demo and in local dev there's no token to send —
 * this is a transparent no-op.
 */
const KEY = "kiln.studioToken";
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
      const entered = window.prompt("🔒 This Kiln studio is password-protected.\nEnter the passphrase to enable AI generation:");
      if (entered) {
        localStorage.setItem(KEY, entered.trim());
        window.alert("Passphrase saved. Click the action again to run it.");
      }
    }
  }
  return res;
};

export {};
