"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useLinkStatus } from "next/link";
import { useFormStatus } from "react-dom";

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 animate-spin ${className}`}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.5"
        className="opacity-25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="opacity-95"
      />
    </svg>
  );
}

export type SubmitButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  pending?: boolean;
  pendingText?: ReactNode;
  spinnerClassName?: string;
};

export function SubmitButton({
  children,
  pending: externalPending = false,
  pendingText,
  disabled,
  className = "",
  name,
  value,
  spinnerClassName = "h-4 w-4",
  ...rest
}: SubmitButtonProps) {
  const { pending: formPending, data } = useFormStatus();
  const isFormPending = Boolean(externalPending || formPending);

  const matchesClicked =
    !formPending ||
    name === undefined ||
    value === undefined ||
    data?.get(name) === String(value);

  const isThisPending = Boolean(externalPending || (formPending && matchesClicked));

  return (
    <button
      {...rest}
      type="submit"
      name={name}
      value={value}
      disabled={Boolean(disabled || isFormPending)}
      aria-busy={isThisPending || undefined}
      className={`inline-flex items-center justify-center gap-2 disabled:pointer-events-none disabled:opacity-60 ${isThisPending ? "cursor-wait" : ""} ${className}`}
    >
      {isThisPending && <Spinner className={spinnerClassName} />}
      <span>{isThisPending && pendingText !== undefined ? pendingText : children}</span>
    </button>
  );
}

export function NavPendingBar() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden="true"
      className="escom-nav-pending pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] overflow-hidden bg-[#155775]/15"
    >
      <span className="escom-top-progress block h-full w-2/5 bg-[#155775]" />
    </span>
  );
}
