// Reusable modal + custom-dropdown primitives for Mimic (§3.1).
//
// Markup and CSS classes are ported verbatim from `MIMIC Prototype.html` (.modal-backdrop, .modal-card,
// .dropdown-wrapper / .dropdown-trigger / .dropdown-menu / .dropdown-option). State lives in React (the prototype's
// <script> demo logic is intentionally NOT copied). Modals close via the × button, backdrop click, or Escape.

import { type FC, type MouseEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

export type ModalKey = 'settings' | 'about' | 'credits' | 'versions';

interface ModalContainerProps {
  modalKey: ModalKey;
  titleKey: string; // visible heading — passed through t() by the caller's prop
  children: ReactNode;
  onClose: () => void;
}

/** Exit fade duration. Matches `--transition-smooth` (240ms) in theme.css; the timer is only a fallback — the real
 * unmount trigger is the backdrop's `transitionend`. A small buffer keeps it safe against rounding (§1). */
const MODAL_EXIT_MS = 300;

/** Backdrop dialog: closes on × click, backdrop click, or Escape. Escape dismisses an open dropdown first (§3.1).
 *
 * The prototype drives visibility by toggling `.is-open` on `.modal-backdrop` (its CSS sets `opacity: 0`
 * and `pointer-events: none` until `.is-open`). React mounts this container only while a modal is active, so it
 * carries `is-open` for its whole lifetime — closing unmounts it. Without the class the backdrop stayed at
 * opacity 0 / pointer-events none, so every modal rendered but was invisible and unclickable.
 *
 * Entrance/exit animations (§1): `.is-open` is decoupled from mount/unmount. The container mounts at `opacity: 0`
 * (no `.is-open`) and adds the class on the next animation frame so the fade-in runs instead of snapping in; on close
 * it removes `.is-open`, waits for the CSS transition to finish, then calls `onClose()` so React unmounts only after
 * the fade-out has played. Mounting with `.is-open` directly (as before) skipped both transitions.
 */
export const ModalContainer: FC<ModalContainerProps> = ({ modalKey, titleKey, children, onClose }) => {
  // Gates the `.is-open` class so the backdrop can animate in and out rather than snapping. Decoupled from mount/
  // unmount — see the JSDoc above.
  const [opened, setOpened] = useState(false);
  // Guards against a second close request during the exit transition; ref lets cleanup clear a pending timer.
  const closingRef = useRef(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Mount element at opacity:0 (no `.is-open`), then add `.is-open` on the next animation frame so the entrance
    // transition runs instead of being skipped by mounting with the class already present.
    const rafId = requestAnimationFrame(() => setOpened(true));
    return () => cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => () => {
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
  }, []);

  // Begin the exit animation, then unmount once it finishes so the fade-out is visible (§1).
  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setOpened(false);
    exitTimerRef.current = setTimeout(() => onClose(), MODAL_EXIT_MS);
  }, [onClose]);

  // §1 — only close when the backdrop itself is clicked, never when a descendant (card / body / controls) is. The
  // prototype guards this with `if (e.target === backdrop)`; mirroring it here keeps clicks inside the dialog safe.
  const handleBackdropClick = useCallback(
    (e: MouseEvent) => {
      if (e.target !== e.currentTarget) return;
      handleClose();
    },
    [handleClose],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Prefer closing an open custom dropdown; otherwise close the modal.
      if (!closingRef.current && document.querySelector('.dropdown-menu.is-open')) {
        document.querySelectorAll<HTMLElement>('.dropdown-menu.is-open').forEach((m) => m.classList.remove('is-open'));
      } else {
        handleClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleClose]);

  // Unmount as soon as the backdrop's opacity fade finishes, instead of always waiting for the fallback timer. The
  // inline handler lets TypeScript infer React's TransitionEvent (which carries `propertyName`).
  return (
    <div
      id={`modal-${modalKey}`}
      className={`modal-backdrop${opened ? ' is-open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`modal-${modalKey}-title`}
      onClick={handleBackdropClick}
      onTransitionEnd={(e) => {
        if (e.propertyName === 'opacity' && !opened && closingRef.current) {
          if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
          onClose();
        }
      }}
    >
      <div className="modal-card" onClick={(e: MouseEvent) => {
        // §1 — stop the click from bubbling to the backdrop so anything inside (inputs, avatar grid, dropdowns)
        // stays interactive instead of closing the modal.
        e.stopPropagation();
      }}>
        <div className="card-header">
          <h3 id={`modal-${modalKey}-title`} className="card-title">
            {titleKey}
          </h3>
          <button type="button" className="circle-icon-btn" aria-label="Close" onClick={handleClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
};

interface DropdownOption<T extends string> {
  value: T;
  label: string;
}

interface DropdownProps<T extends string> {
  options: readonly DropdownOption<T>[];
  value: T;
  onSelect: (value: T) => void;
}

/** Custom listbox dropdown (§3.1): opens/closes on trigger click, closes on outside click or Escape. */
export function Dropdown<T extends string>({ options, value, onSelect }: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handleClose = (e: Event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClose);
    return () => document.removeEventListener('mousedown', handleClose);
  }, [open]);

  const handleSelect = (option: DropdownOption<T>) => {
    onSelect(option.value);
    setOpen(false);
  };

  return (
    <div className="dropdown-wrapper" ref={wrapperRef}>
      <button
        type="button"
        className={`dropdown-trigger${open ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        {selected?.label ?? ''}
      </button>
      <div className={`dropdown-menu${open ? ' is-open' : ''}`} role="listbox">
        {options.map((option) => (
          <button
            type="button"
            key={option.value}
            className={`dropdown-option${option.value === value ? ' is-selected' : ''}`}
            role="option"
            aria-selected={option.value === value}
            onClick={() => handleSelect(option)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
