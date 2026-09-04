import { useCallback, useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  title?: string;
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Hide the header entirely (used by celebration modals). */
  bare?: boolean;
  labelledBy?: string;
  /** Escape and backdrop clicks are ignored when false. */
  dismissible?: boolean;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog: focus is moved in on open, trapped while open, and
 * returned to the trigger on close. Escape closes when dismissible.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  bare = false,
  labelledBy,
  dismissible = true,
}: ModalProps): JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    if (dismissible) onClose?.();
  }, [dismissible, onClose]);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const node = dialogRef.current;
    if (node) {
      const first = node.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? node).focus();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }

      if (event.key !== 'Tab') return;

      const node = dialogRef.current;
      if (!node) return;

      const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [close]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : title}
        aria-labelledby={labelledBy}
        ref={dialogRef}
        tabIndex={-1}
      >
        {!bare && (
          <div className="modal__header">
            <h2 className="modal__title">{title}</h2>
            {dismissible && onClose && (
              <button type="button" className="modal__close" onClick={onClose} aria-label="Stäng">
                ✕
              </button>
            )}
          </div>
        )}
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>
  );
}
