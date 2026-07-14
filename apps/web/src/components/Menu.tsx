import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export interface MenuItem {
  key: string;
  icon?: string; // an Icon name
  label: string;
  description?: string; // one-line "what this does", shown under the label
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean; // highlight the payoff item (e.g. Full-stack)
}

/**
 * A small dependency-free dropdown: a trigger button that opens a labeled, described item list.
 * Used to collapse the many "View code" actions (improve passes, export options) behind two clear
 * menus so the toolbar shows three controls, not ten — each item explains itself in one line.
 * Closes on outside-click, Escape, or item choice.
 */
export function Menu({ trigger, icon, items, align = "left", accent = false, disabled }: {
  trigger: string;
  icon?: string;
  items: MenuItem[];
  align?: "left" | "right";
  accent?: boolean;
  disabled?: boolean;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [open]);
  return (
    <div className={`menu menu-${align}`} ref={ref}>
      <button className={`code-export ${accent ? "" : "ghost"} menu-trigger`} disabled={disabled}
        aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {icon && <Icon name={icon} size={14} />}{trigger}<Icon name="chevronDown" size={13} />
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          {items.map((it) => (
            <button key={it.key} role="menuitem" className={`menu-item${it.accent ? " accent" : ""}`}
              disabled={it.disabled} onClick={() => { setOpen(false); it.onClick(); }}>
              {it.icon && <span className="menu-item-icon"><Icon name={it.icon} size={16} /></span>}
              <span className="menu-item-text">
                <span className="menu-item-label">{it.label}</span>
                {it.description && <span className="menu-item-desc">{it.description}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
