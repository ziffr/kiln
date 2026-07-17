/**
 * Right-hand slide-in drawer — the roomy surface for content-heavy chrome (settings today) that a
 * 440/640px modal card crams. Same shell the Prompt studio established: fixed to the right edge,
 * full height, Esc closes, backdrop click closes, the close button takes focus on open.
 *
 * Pick Drawer over Modal for a surface the user READS and TUNES. Keep Modal for a blocking decision
 * (confirm/prompt) — modality is the correct affordance for a question that must be answered before
 * continuing, and a drawer would weaken it.
 */
import { useEffect, useRef, type JSX, type ReactNode } from "react";
import { Icon } from "./Icon";

export function Drawer({ title, icon, onClose, children, footer, wide }: {
  title: string; icon?: string; onClose: () => void; children?: ReactNode; footer?: ReactNode; wide?: boolean;
}): JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="drawer-overlay" onMouseDown={onClose} role="presentation">
      <aside
        className={`drawer${wide ? " wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="drawer-head">
          <div className="drawer-title">
            {icon && <Icon name={icon} size={15} />}
            <h3>{title}</h3>
          </div>
          <button ref={closeRef} className="drawer-x" onClick={onClose} aria-label="Close" title="Close">
            <Icon name="x" size={15} />
          </button>
        </header>
        <div className="drawer-scroll">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </div>
  );
}
