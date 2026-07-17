/**
 * The docs site, read in place — an iframe of DOCS_URL inside the shared Drawer shell, so "how does
 * this work?" doesn't cost you the app. Deep-linkable: `path` opens a specific page (Settings' "Learn
 * more" points at the engine reference).
 *
 * Framing works because the docs are GitHub Pages, which sends neither X-Frame-Options nor a CSP
 * `frame-ancestors` — verified against docs.kilnstudio.app. That's the host's default, not a promise
 * we control: if a future docs host starts refusing to frame, this drawer renders an empty white box
 * with no error we can catch (a blocked frame is not an `onError`). Hence the header's open-in-new-tab
 * button is NOT decorative — it's the fallback path, and the reason a plain link isn't enough.
 *
 * `sandbox` is deliberately absent: same-origin-less framing of our own static docs needs no extra
 * privilege, and a sandbox without `allow-scripts` would break the docs' own search/nav.
 */
import { useState, type JSX } from "react";
import { Drawer } from "./Drawer";
import { Icon } from "./Icon";
import { DOCS_URL } from "../config";

type T = (k: string, o?: Record<string, unknown>) => string;

export function DocsDrawer({ path, onClose, t }: { path?: string; onClose: () => void; t: T }): JSX.Element {
  const [loading, setLoading] = useState(true);
  const src = path ? `${DOCS_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}` : DOCS_URL;
  return (
    <Drawer
      title={t("docsOpen")}
      icon="book"
      onClose={onClose}
      closeLabel={t("close")}
      wide
      flush
      badge={
        <a className="drawer-ext" href={src} target="_blank" rel="noreferrer" title={t("docsNewTab")}>
          <Icon name="external" size={12} /> {t("docsNewTab")}
        </a>
      }
    >
      <div className="docs-frame">
        {loading && <div className="docs-frame-load"><span className="map-spinner" aria-hidden="true" /></div>}
        <iframe src={src} title={t("docsOpen")} onLoad={() => setLoading(false)} />
      </div>
    </Drawer>
  );
}
