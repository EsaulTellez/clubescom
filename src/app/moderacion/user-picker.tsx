"use client";

import { useMemo, useState } from "react";
import { input } from "@/lib/ui";

type Person = { id: string; name: string; role: string; area: string | null };

export function StrikeUserPicker({
  people,
  defaultUserId = "",
}: {
  people: Person[];
  defaultUserId?: string;
}) {
  const initialPerson = people.find((p) => p.id === defaultUserId);
  const [search, setSearch] = useState(initialPerson ? initialPerson.name : "");
  const [selectedId, setSelectedId] = useState(defaultUserId);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("es-MX");
    if (!q) return people.slice(0, 12);
    return people
      .filter((p) => `${p.name} ${p.role} ${p.area ?? ""}`.toLocaleLowerCase("es-MX").includes(q))
      .slice(0, 12);
  }, [people, search]);

  return (
    <div className="grid gap-1.5 text-sm font-bold">
      <label htmlFor="strike-user-search">Buscar cuenta involucrada</label>
      <input
        id="strike-user-search"
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Escribe el nombre o rol para filtrar…"
        className={input}
      />
      <select
        required
        name="user_id"
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        className={input}
      >
        <option value="" disabled>
          Selecciona una persona ({filtered.length} mostradas)
        </option>
        {filtered.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name} · {person.role}
            {person.area ? ` · ${person.area}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
