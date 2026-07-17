/**
 * The right-hand slide-in drawer — ONE shell for every drawer in the app (prompt studio, settings,
 * docs). Fixed to the right edge, full height, Esc closes, backdrop click closes, the close button
 * takes focus on open.
 *
 * The chrome here is the canonical drawer design; the docked detail panels in `.stage-detail` reuse
 * the same head/tab CSS (`.drawer-head`, `.drawer-tabs`) so a detail and a drawer read as the same
 * surface. They stay DOCKED rather than using this component on purpose: a detail is read against
 * the canvas it describes, so it reflows the map instead of covering it.
 *
 * Pick Drawer over Modal for a surface the user READS and TUNES. Keep Modal for a blocking decision
 * (confirm/prompt) — modality is the correct affordance for a question that must be answered before
 * continuing, and a drawer would weaken it.
 *
 * `tabs` and `lead` sit OUTSIDE the scroll container, pinned under the head — a tab strip that
 * scrolls away with its own content is unreachable exactly when a long tab needs it.
 */
import { useEffect, useRef, type JSX, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

export function Drawer({ title, icon, badge, onClose, children, tabs, lead, footer, wide, flush, closeLabel = "Close" }: {
  title: string;
  icon?: string;
  /** Small qualifier beside the title (e.g. which stage's prompts these are). */
  badge?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  /** Tab strip, pinned under the head. Use <DrawerTabs> so every drawer's tabs look the same. */
  tabs?: ReactNode;
  /** One-line explanation of the surface, pinned under the head. */
  lead?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Drop the body's padding + scroll so the content can fill the shell (the docs iframe). */
  flush?: boolean;
  closeLabel?: string;
}): JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Portalled to <body> so the drawer is a VIEWPORT overlay no matter where it's rendered from. Callers
  // render it next to the thing it belongs to (the prompt studio sits inside the stage's JSX), and an
  // overlay's geometry must not depend on that: nested inside the stage subtree, this overlay spanned
  // its ancestor's box rather than the viewport, so a "full-height right-edge drawer" landed mid-canvas.
  // The portal also keeps drawer-over-drawer stacking honest (docs opened from Settings' "Learn more").
  return createPortal(
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
            {badge && <span className="muted drawer-badge">{badge}</span>}
          </div>
          <button ref={closeRef} className="drawer-x" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
            <Icon name="x" size={15} />
          </button>
        </header>
        {lead && <p className="drawer-lead muted">{lead}</p>}
        {tabs}
        <div className={`drawer-scroll${flush ? " flush" : ""}`}>{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}

/**
 * The shared tab strip. Used by the drawers AND the docked detail panels (AgentDetail) so tabs are one
 * design everywhere — segmented pills, not the underline strip Settings used to carry on its own.
 */
export function DrawerTabs<T extends string>({ tabs, active, onSelect, label, className }: {
  tabs: readonly { id: T; label: string }[];
  active: T;
  onSelect: (id: T) => void;
  label?: string;
  className?: string;
}): JSX.Element {
  return (
    <div className={`drawer-tabs${className ? ` ${className}` : ""}`} role="tablist" aria-label={label}>
      {tabs.map((tb) => (
        <button
          key={tb.id}
          role="tab"
          aria-selected={active === tb.id}
          className={`drawer-tab${active === tb.id ? " active" : ""}`}
          onClick={() => onSelect(tb.id)}
        >
          {tb.label}
        </button>
      ))}
    </div>
  );
}
