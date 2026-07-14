/**
 * Lightweight, dependency-free modal + input/confirm dialogs (token-styled, accessible) — replaces the
 * jarring native window.prompt()/confirm(). Esc closes, backdrop closes, the primary field autofocuses.
 */
import { useEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { Icon } from "./Icon";

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children?: ReactNode; footer?: ReactNode; wide?: boolean }): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-overlay" onMouseDown={onClose} role="presentation">
      <div className={`modal-card${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-x" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        {children && <div className="modal-body">{children}</div>}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function InputDialog({ title, label, initial = "", placeholder, multiline, password, submitLabel, cancelLabel, onSubmit, onClose }: {
  title: string; label?: string; initial?: string; placeholder?: string; multiline?: boolean; password?: boolean;
  submitLabel: string; cancelLabel: string; onSubmit: (value: string) => void; onClose: () => void;
}): JSX.Element {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select?.(); }, []);
  const submit = () => { onSubmit(value); onClose(); };
  return (
    <Modal title={title} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>{cancelLabel}</button>
        <button className="btn primary" onClick={submit}>{submitLabel}</button>
      </>}>
      {label && <label className="modal-label">{label}</label>}
      {multiline ? (
        <textarea ref={ref as React.RefObject<HTMLTextAreaElement>} className="modal-input" rows={3} value={value} placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }} />
      ) : (
        <input ref={ref as React.RefObject<HTMLInputElement>} className="modal-input" type={password ? "password" : "text"} value={value} placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
      )}
    </Modal>
  );
}

export function ConfirmDialog({ title, message, confirmLabel, cancelLabel, danger, onConfirm, onClose }: {
  title: string; message: string; confirmLabel: string; cancelLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void;
}): JSX.Element {
  return (
    <Modal title={title} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>{cancelLabel}</button>
        <button className={`btn ${danger ? "danger" : "primary"}`} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
      </>}>
      <p className="modal-message">{message}</p>
    </Modal>
  );
}
