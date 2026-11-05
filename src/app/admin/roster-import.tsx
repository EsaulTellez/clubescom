"use client";

import { useActionState, useMemo, useState } from "react";
import { importRoster, type RosterImportState } from "./actions";
import { btn, btnGhost, input } from "@/lib/ui";

type Row = { row: number; name: string; email: string };
type Issue = { row: number; email: string; detail: string };
type Preview = { valid: Row[]; issues: Issue[]; total: number };

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 200;

function normalizeHeader(value: string) {
  return value.trim().toLocaleLowerCase("es-MX").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s_-]+/g, "");
}

function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  let delimiter = ",";
  let quoted = false;
  const counts = new Map([[",", 0], [";", 0], ["\t", 0]]);
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') i += 1;
      else quoted = !quoted;
    } else if (char === "\n" && !quoted) break;
    else if (!quoted && counts.has(char)) counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  delimiter = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];

  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (field.length === 0 || quoted) quoted = !quoted;
      else field += char;
    } else if (char === delimiter && !quoted) {
      record.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      record.push(field.trim());
      if (record.some((cell) => cell.length)) records.push(record);
      record = [];
      field = "";
      if (records.length > MAX_ROWS + 1) throw new Error(`El archivo supera el límite de ${MAX_ROWS} filas.`);
    } else field += char;
  }
  if (quoted) throw new Error("Hay una comilla sin cerrar. Corrige el CSV y vuelve a cargarlo.");
  record.push(field.trim());
  if (record.some((cell) => cell.length)) records.push(record);
  return records;
}

function previewCsv(text: string): Preview {
  const records = parseCsv(text);
  if (records.length < 2) throw new Error("El CSV debe incluir encabezados y al menos una cuenta.");
  const headers = records[0].map(normalizeHeader);
  const nameIndex = headers.findIndex((header) => ["nombre", "name", "nombrecompleto"].includes(header));
  const emailIndex = headers.findIndex((header) => ["correo", "email", "correoelectronico"].includes(header));
  if (nameIndex < 0 || emailIndex < 0) throw new Error("Faltan encabezados. Usa las columnas nombre y correo (o name y email).");
  const rows = records.slice(1);
  if (rows.length > MAX_ROWS) throw new Error(`El archivo supera el límite de ${MAX_ROWS} filas.`);

  const valid: Row[] = [];
  const issues: Issue[] = [];
  const seen = new Set<string>();
  rows.forEach((cells, index) => {
    const rowNumber = index + 2;
    const name = cells[nameIndex]?.trim().replace(/\s+/g, " ") ?? "";
    const email = cells[emailIndex]?.trim().toLowerCase() ?? "";
    let detail = "";
    if (name.length < 2 || name.length > 120 || /[<>\u0000-\u001f]/.test(name)) detail = "Nombre obligatorio (2–120 caracteres).";
    else if (!/^[^\s@,;]+@(?:alumno\.)?ipn\.mx$/i.test(email)) detail = "Usa correo @alumno.ipn.mx o @ipn.mx.";
    else if (seen.has(email)) detail = "Correo repetido dentro del CSV.";
    if (detail) issues.push({ row: rowNumber, email, detail });
    else {
      seen.add(email);
      valid.push({ row: rowNumber, name, email });
    }
  });
  return { valid, issues, total: rows.length };
}

function downloadIssues(issues: Issue[]) {
  if (!issues.length) return;
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const csv = ["fila,correo,error", ...issues.map((item) => `${item.row},${quote(item.email)},${quote(item.detail)}`)].join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  link.download = "errores-padron-escom.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function ConfirmImport({ rows, disabled }: { rows: Row[]; disabled: boolean }) {
  const [state, action, pending] = useActionState(importRoster, {} as RosterImportState);
  const serverIssues = (state.rows ?? []).filter((row) => row.status === "error").map(({ row, email, detail }) => ({ row, email, detail }));
  return (
    <div className="space-y-3">
      <form action={action}>
        <input type="hidden" name="rows" value={JSON.stringify(rows)} />
        <button className={btn} disabled={disabled || pending}>
          {pending ? "Creando invitaciones…" : `Confirmar importación (${rows.length})`}
        </button>
      </form>
      {state.error && <p role="alert" className="text-sm text-[#8C1D18]">{state.error}</p>}
      {typeof state.created === "number" && (
        <div className="space-y-2 rounded-xl border border-[#b8d7ca] bg-[#eff8f2] p-3 text-sm text-[#123044]" role="status">
          <p><strong>{state.created}</strong> invitación(es) creada(s). La cuenta se activa cuando cada persona verifica su correo.</p>
          {serverIssues.length > 0 && <button type="button" className={btnGhost} onClick={() => downloadIssues(serverIssues)}>Descargar filas con error</button>}
        </div>
      )}
      {state.rows?.length ? (
        <ul className="space-y-1 text-sm" aria-label="Resultado de importación">
          {state.rows.map((row) => <li key={`${row.row}-${row.email}`} className={row.status === "error" ? "text-[#8C1D18]" : "text-[#436b54]"}>Fila {row.row} · {row.email}: {row.detail}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

export function RosterImport() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const clientIssues = useMemo(() => preview?.issues ?? [], [preview]);

  async function readFile(file?: File) {
    setPreview(null);
    setMessage("");
    setRevision((value) => value + 1);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) return setMessage("Selecciona un archivo .csv.");
    if (file.size > MAX_BYTES) return setMessage("El CSV no puede superar 2 MB.");
    try {
      setPreview(previewCsv(await file.text()));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo leer el CSV.");
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-[#c9dbe7] bg-[#fffefa] p-5 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.12em] text-[#006699]">Padrón · CSV</p>
        <h2 className="mt-1 text-lg font-semibold text-[#123044]">Invitar cuentas institucionales</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[#526778]">Columnas requeridas: <code>nombre,correo</code>. Acepta <code>@alumno.ipn.mx</code> y <code>@ipn.mx</code>; el rol se deriva del dominio. Se envía una invitación de Supabase Auth para verificar el correo.</p>
        <p className="mt-1 text-sm text-[#526778]">Hasta {MAX_ROWS} filas por archivo. Solo se crean cuentas nuevas; el CSV no puede asignar roles, áreas ni contraseñas.</p>
        <a className="mt-2 inline-flex text-sm font-semibold text-[#006699] underline decoration-[#9fc8dc] underline-offset-4" href="data:text/csv;charset=utf-8,%EF%BB%BFnombre%2Ccorreo%0D%0A" download="plantilla-padron-escom.csv">Descargar plantilla CSV</a>
      </div>
      <label className="block space-y-2 text-sm font-medium text-[#123044]">
        Archivo CSV
        <input className={`${input} file:mr-3 file:rounded-lg file:border-0 file:bg-[#e8f2f8] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#006699]`} type="file" accept=".csv,text/csv" onChange={(event) => void readFile(event.currentTarget.files?.[0])} />
      </label>
      {message && <p role="alert" className="text-sm text-[#8C1D18]">{message}</p>}
      {preview && (
        <div className="space-y-3">
          <p className="text-sm text-[#123044]">Vista previa: <strong>{preview.valid.length}</strong> listas para invitar · <strong>{preview.issues.length}</strong> con error · {preview.total} filas.</p>
          {clientIssues.length > 0 && <button type="button" className={btnGhost} onClick={() => downloadIssues(clientIssues)}>Descargar errores CSV</button>}
          <div className="max-h-72 overflow-auto rounded-xl border border-[#d5e4ee]">
            <table className="w-full min-w-[540px] text-left text-sm">
              <thead className="sticky top-0 bg-[#f3f7fa] text-[#526778]"><tr><th className="p-2">Fila</th><th className="p-2">Nombre</th><th className="p-2">Correo</th><th className="p-2">Validación</th></tr></thead>
              <tbody>{preview.valid.map((row) => <tr key={row.row} className="border-t border-[#e5edf2]"><td className="p-2">{row.row}</td><td className="p-2">{row.name}</td><td className="p-2">{row.email}</td><td className="p-2 text-[#436b54]">Lista · {row.email.endsWith("@alumno.ipn.mx") ? "Alumno" : "Profesor"}</td></tr>)}
                {preview.issues.map((issue) => <tr key={`error-${issue.row}`} className="border-t border-[#e5edf2] bg-[#fff6f4]"><td className="p-2">{issue.row}</td><td className="p-2">—</td><td className="p-2">{issue.email || "—"}</td><td className="p-2 text-[#8C1D18]">{issue.detail}</td></tr>)}</tbody>
            </table>
          </div>
          <ConfirmImport key={revision} rows={preview.valid} disabled={!preview.valid.length || preview.issues.length > 0} />
        </div>
      )}
    </section>
  );
}
