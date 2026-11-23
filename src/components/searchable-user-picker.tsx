"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Spinner } from "@/components/loading-ui";
import { input, label as labelClass } from "@/lib/ui";

export type DirectoryUserOption = {
  id: string;
  name: string;
  role?: string;
  area?: string | null;
  boleta?: string | null;
  email?: string | null;
};

const ROLE_TEXT: Record<string, string> = {
  alumno: "Alumno",
  profesor: "Profesor",
  moderador: "Moderador",
  admin: "Operación",
};

function matchesLocally(user: DirectoryUserOption, term: string) {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return (
    user.name.toLowerCase().includes(q) ||
    (user.boleta ?? "").toLowerCase().includes(q) ||
    (user.email ?? "").toLowerCase().includes(q)
  );
}

export function SearchableUserPicker({
  name,
  label,
  roles,
  returnField = "id",
  initialUsers = [],
  defaultUser = null,
  defaultValue = "",
  required = false,
  allowClear = true,
  placeholder = "Buscar por boleta, nombre o correo…",
  emptyHint = "No encontramos cuentas activas con esa búsqueda.",
  onSelect,
}: {
  name: string;
  label?: string;
  roles: ("alumno" | "profesor" | "moderador" | "admin")[];
  returnField?: "id" | "email";
  initialUsers?: DirectoryUserOption[];
  defaultUser?: DirectoryUserOption | null;
  defaultValue?: string;
  required?: boolean;
  allowClear?: boolean;
  placeholder?: string;
  emptyHint?: string;
  onSelect?: (user: DirectoryUserOption | null) => void;
}) {
  const inputId = useId();
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  const resolvedInitial = useMemo(() => {
    if (defaultUser) return defaultUser;
    if (!defaultValue) return null;
    return (
      initialUsers.find((u) => (returnField === "email" ? u.email === defaultValue : u.id === defaultValue)) ??
      null
    );
  }, [defaultUser, defaultValue, initialUsers, returnField]);

  const [selected, setSelected] = useState<DirectoryUserOption | null>(resolvedInitial);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [remoteResults, setRemoteResults] = useState<DirectoryUserOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const rolesParam = roles.join(",");
  const localFiltered = useMemo(
    () => initialUsers.filter((u) => matchesLocally(u, query)).slice(0, 20),
    [initialUsers, query],
  );
  const results = remoteResults ?? localFiltered;

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: query.trim(),
          roles: rolesParam,
          limit: "25",
        });
        const response = await fetch(`/api/users/search?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { users?: DirectoryUserOption[] };
        if (Array.isArray(payload.users)) {
          setRemoteResults(payload.users);
          setActiveIndex(0);
        }
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") {
          setRemoteResults(null);
        }
      } finally {
        setLoading(false);
      }
    }, query.trim() ? 180 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, rolesParam]);

  const selectedValue = selected
    ? returnField === "email"
      ? selected.email ?? ""
      : selected.id
    : defaultValue && !selected
      ? ""
      : "";

  function choose(user: DirectoryUserOption) {
    setSelected(user);
    setQuery("");
    setOpen(false);
    onSelect?.(user);
  }

  function clear() {
    setSelected(null);
    setQuery("");
    setOpen(true);
    onSelect?.(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, Math.max(0, results.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && open && results[activeIndex]) {
      e.preventDefault();
      choose(results[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label htmlFor={inputId} className={labelClass}>
          {label}
        </label>
      )}
      <input type="hidden" name={name} value={selectedValue} />

      {selected ? (
        <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-[#96bfd3] bg-[#f1f8fc] px-3 py-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-bold text-[#143547]">{selected.name}</span>
              {selected.boleta && (
                <span className="rounded bg-[#dcecf4] px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#0c4d6c]">
                  {selected.boleta}
                </span>
              )}
              {selected.role && (
                <span className="text-[11px] font-semibold text-[#516976]">
                  · {ROLE_TEXT[selected.role] ?? selected.role}
                </span>
              )}
            </div>
            {selected.email && (
              <p className="truncate text-xs text-[#4b6472]">{selected.email}</p>
            )}
          </div>
          {allowClear && (
            <button
              type="button"
              onClick={clear}
              className="shrink-0 rounded border border-[#b8cfd9] bg-white px-2.5 py-1 text-xs font-bold text-[#1d495e] hover:border-[#006699] hover:text-[#006699]"
            >
              Cambiar
            </button>
          )}
        </div>
      ) : (
        <div className="relative mt-1">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5c727e]"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="9" r="5.5" />
              <path d="m13.5 13.5 3.5 3.5" strokeLinecap="round" />
            </svg>
          </span>
          <input
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            autoComplete="off"
            value={query}
            required={required && !selectedValue}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={`${input} mt-0 pl-9 pr-9`}
          />
          {loading && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#006699]">
              <Spinner className="h-4 w-4" />
            </span>
          )}
        </div>
      )}

      {open && !selected && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 z-40 mt-1 max-h-64 overflow-y-auto rounded-md border border-[#b9c7ce] bg-white shadow-[0_12px_30px_rgba(15,34,46,0.16)]"
        >
          {results.length === 0 ? (
            <p className="px-3.5 py-3 text-xs font-medium text-[#5f707a]">
              {loading ? "Buscando…" : emptyHint}
            </p>
          ) : (
            <ul className="divide-y divide-[#edf1f3] py-1">
              {results.map((item, idx) => {
                const isActive = idx === activeIndex;
                return (
                  <li key={item.id} role="option" aria-selected={isActive}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => choose(item)}
                      className={`flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left transition ${
                        isActive ? "bg-[#eaf4f9]" : "hover:bg-[#f6fafc]"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#153445]">{item.name}</p>
                        <p className="truncate text-xs text-[#546975]">
                          {item.email ?? (item.role ? ROLE_TEXT[item.role] ?? item.role : "")}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {item.boleta && (
                          <span className="rounded bg-[#edf3f6] px-2 py-0.5 font-mono text-[11px] font-bold text-[#144c69]">
                            {item.boleta}
                          </span>
                        )}
                        {item.role && (
                          <span className="rounded border border-[#dce4e8] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#566b77]">
                            {ROLE_TEXT[item.role] ?? item.role}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
