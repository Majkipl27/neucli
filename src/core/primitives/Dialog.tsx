import { useEffect, useRef } from 'react';
import type { DialogHTMLAttributes, MouseEvent, ReactNode } from 'react';

export interface DialogProps extends Omit<DialogHTMLAttributes<HTMLDialogElement>, 'open' | 'onClose'> {
  /** Shown while true. */
  open: boolean;
  /** Esc or a click on the backdrop asked to close it. */
  onClose?: () => void;
  /** Modal (default): the rest of the page is inert and focus stays inside until it closes. */
  modal?: boolean;
  children?: ReactNode;
}

/**
 * A native <dialog>, mounted only while open. `showModal()` gives the
 * browser's focus handling, Esc to close, the ::backdrop and aria-modal.
 * When it closes, focus goes back to whatever opened it.
 *
 * Mounting only while open matters: layout classes like `flex` would
 * otherwise beat the browser's display: none for a closed dialog.
 */
export default function Dialog({ open, ...rest }: DialogProps) {
  return open ? <OpenDialog {...rest} /> : null;
}

function OpenDialog({ onClose, modal = true, onClick, children, ...rest }: Omit<DialogProps, 'open'>) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = dialog.ownerDocument.activeElement as HTMLElement | null;
    if (modal) dialog.showModal();
    else dialog.show();
    return () => {
      if (dialog.open) dialog.close();
      opener?.focus?.();
    };
  }, [modal]);

  // A click outside the dialog's box lands on the dialog element itself (the backdrop).
  const closeOnBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    onClick?.(event);
    if (!modal || event.target !== event.currentTarget) return;
    const r = event.currentTarget.getBoundingClientRect();
    const inside = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
    if (!inside) onClose?.();
  };

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose?.();
      }}
      onClick={closeOnBackdrop}
      {...rest}
    >
      {children}
    </dialog>
  );
}
