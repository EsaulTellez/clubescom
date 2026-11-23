"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export type DialogAccent = "blue" | "teal" | "amber" | "crimson";
export type DialogSize = "md" | "lg" | "xl" | "2xl";

const ACCENT_CLASSES: Record<DialogAccent, { borderTop: string; kicker: string; headerBg: string }> = {
  blue: {
    borderTop: "border-t-[#155775]",
    kicker: "text-[#0e5575]",
    headerBg: "bg-[#f2f6f8]",
  },
  teal: {
    borderTop: "border-t-[#165b47]",
    kicker: "text-[#145542]",
    headerBg: "bg-[#f1f7f4]",
  },
  amber: {
    borderTop: "border-t-[#9c6d12]",
    kicker: "text-[#885d0d]",
    headerBg: "bg-[#faf6ea]",
  },
  crimson: {
    borderTop: "border-t-[#8c2925]",
    kicker: "text-[#8c2925]",
    headerBg: "bg-[#fbf2f1]",
  },
};

const SIZE_CLASSES: Record<DialogSize, string> = {
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
  "2xl": "max-w-4xl",
};

export function FormDialog({
  title,
  kicker,
  subtitle,
  accent = "blue",
  size = "lg",
  onClose,
  children,
  serifTitle = false,
  disableClose = false,
}: {
  title: string;
  kicker?: string;
  subtitle?: string;
  accent?: DialogAccent;
  size?: DialogSize;
  onClose: () => void;
  children: ReactNode;
  serifTitle?: boolean;
  disableClose?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropPress = useRef(false);
  const titleId = useId();
  const styles = ACCENT_CLASSES[accent];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    if (!dialog.open) {
      dialog.showModal();
    }
    document.body.style.overflow = "hidden";
    return () => {
      if (dialog.open) {
        dialog.close();
      }
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  function isOutside(event: React.MouseEvent<HTMLDialogElement> | React.PointerEvent<HTMLDialogElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    );
  }

  function safeClose() {
    if (!disableClose) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        safeClose();
      }}
      onPointerDown={(event) => {
        backdropPress.current = event.target === event.currentTarget && isOutside(event);
      }}
      onClick={(event) => {
        if (backdropPress.current && event.target === event.currentTarget && isOutside(event)) {
          safeClose();
        }
      }}
      className={`escom-dialog m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-1.5rem)] ${SIZE_CLASSES[size]} overflow-hidden rounded-md border border-[#c4c8bf] border-t-4 ${styles.borderTop} bg-[#fffdf7] p-0 text-[#173142] shadow-[0_24px_64px_rgba(12,28,40,0.32)] backdrop:bg-[#0b1820]/65 backdrop:backdrop-blur-[2px]`}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <header
          className={`flex shrink-0 items-start justify-between gap-4 border-b border-[#dad6c8] ${styles.headerBg} px-5 py-4 sm:px-6`}
        >
          <div className="min-w-0 space-y-0.5">
            {kicker && (
              <p className={`text-[11px] font-extrabold uppercase tracking-[0.14em] ${styles.kicker}`}>
                {kicker}
              </p>
            )}
            <h2
              id={titleId}
              className={`text-lg font-extrabold tracking-tight text-[#142d3d] sm:text-xl ${
                serifTitle ? "font-serif" : ""
              }`}
            >
              {title}
            </h2>
            {subtitle && <p className="text-xs font-medium text-[#526773]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={safeClose}
            disabled={disableClose}
            aria-label="Cerrar diálogo"
            className="grid size-9 shrink-0 place-items-center rounded-md border border-[#c7cbc2] bg-white/90 text-[#35505e] transition hover:border-[#155775] hover:bg-white hover:text-[#155775] disabled:opacity-45"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M5 5l10 10M15 5 5 15" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 sm:py-6">
          {children}
        </div>
      </div>
    </dialog>
  );
}

export function FormDialogTrigger({
  title,
  kicker,
  subtitle,
  accent,
  size,
  triggerLabel,
  triggerClassName,
  children,
}: {
  title: string;
  kicker?: string;
  subtitle?: string;
  accent?: DialogAccent;
  size?: DialogSize;
  triggerLabel: string;
  triggerClassName: string;
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </button>
      {open && (
        <FormDialog
          title={title}
          kicker={kicker}
          subtitle={subtitle}
          accent={accent}
          size={size}
          onClose={() => setOpen(false)}
        >
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </FormDialog>
      )}
    </>
  );
}
