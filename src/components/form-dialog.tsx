"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function FormDialog({ title, onClose, children, serifTitle = false }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  serifTitle?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropPress = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  function isOutside(event: React.MouseEvent<HTMLDialogElement> | React.PointerEvent<HTMLDialogElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onPointerDown={(event) => { backdropPress.current = event.target === event.currentTarget && isOutside(event); }}
      onClick={(event) => { if (backdropPress.current && event.target === event.currentTarget && isOutside(event)) onClose(); }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto overscroll-contain rounded-sm border border-[#b8c1bd] border-t-4 border-t-[#155775] bg-[#fffdf7] p-0 text-[#173142] shadow-2xl backdrop:bg-[#0b1820]/65"
    >
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[#cfcbbf] bg-[#e8f0ef] px-5 py-4 sm:px-7">
        <h2 id={titleId} className={`text-xl font-bold tracking-tight ${serifTitle ? "font-serif" : ""}`}>{title}</h2>
        <button type="button" onClick={onClose} aria-label="Cerrar diálogo"
          className="grid size-10 shrink-0 place-items-center rounded-sm border border-[#b8c1bd] text-lg font-bold hover:bg-[#d7e4e4]">
          <span aria-hidden="true">✕</span>
        </button>
      </header>
      <div className="p-5 sm:p-7">{children}</div>
    </dialog>
  );
}

export function FormDialogTrigger({ title, triggerLabel, triggerClassName, children }: {
  title: string;
  triggerLabel: string;
  triggerClassName: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={triggerClassName} aria-haspopup="dialog" onClick={() => setOpen(true)}>{triggerLabel}</button>
      {open && <FormDialog title={title} onClose={() => setOpen(false)}>{children}</FormDialog>}
    </>
  );
}
