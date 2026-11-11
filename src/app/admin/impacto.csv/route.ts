import { getSession } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const user = await getSession();
  if (!user || user.role !== "admin") return new Response("No autorizado", { status: 403 });
  const supabase = await createSupabaseServerClient();
  const [guides, questions] = await Promise.all([supabase.rpc("admin_guide_impact"), supabase.rpc("admin_question_impact")]);
  if (guides.error || questions.error) return new Response("No se pudo generar el reporte", { status: 500 });
  const cell = (v: unknown) => { let s = String(v ?? "").replace(/[\r\n]+/g, " "); if (/^\s*[=+@\-\t]/.test(s)) s = "'" + s; return `"${s.replaceAll('"', '""')}"`; };
  const rows = [["tipo", "area", "nombre", "vistas_o_preguntas", "lectores_o_sin_responder"],
    ...(guides.data ?? []).map((x: {area: string; title: string; views: number; readers: number}) => ["guia", x.area, x.title, x.views, x.readers]),
    ...(questions.data ?? []).map((x: {area: string; questions: number; unanswered: number}) => ["foro", x.area, "", x.questions, x.unanswered])];
  return new Response("\ufeff" + rows.map((row) => row.map(cell).join(",")).join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="impacto-escom.csv"', "Cache-Control": "no-store" } });
}
