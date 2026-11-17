"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { sendMail } from "@/lib/mailer";
import { uploadPublicImage } from "@/lib/storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  canManageAnyClubs,
  canModerateClubKind,
  isUuid,
  KINDS,
  safeHttpUrl,
  type ClubKind,
  type ClubState,
} from "./format";

function pgCode(error: unknown) {
  return typeof error === "object" && error && "code" in error ? String(error.code) : "";
}

function generateSixCharCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function refresh(proposalId?: string, clubId?: string) {
  revalidatePath("/");
  revalidatePath("/clubes");
  revalidatePath("/eventos");
  if (proposalId) revalidatePath(`/clubes/propuestas/${proposalId}`);
  if (clubId) revalidatePath(`/clubes/${clubId}`);
}

export async function createClubDirectly(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user || !canManageAnyClubs(user)) {
    return { error: "Solo Subdirección o el área de clubes correspondiente puede registrar un club directamente." };
  }
  const name = String(form.get("name") ?? "").trim();
  const kind = String(form.get("kind") ?? "");
  const description = String(form.get("description") ?? "").trim();
  const schedule = String(form.get("schedule") ?? "").trim().slice(0, 160);
  const contactEmail = String(form.get("contact_email") ?? "").trim().slice(0, 160);
  const contactInfo = String(form.get("contact_info") ?? "").trim().slice(0, 400);
  const leaderId = String(form.get("leader_id") ?? "");
  const advisorId = String(form.get("advisor_id") ?? "");

  if (
    name.length < 3 ||
    name.length > 120 ||
    description.length < 10 ||
    description.length > 2000 ||
    !KINDS.includes(kind as ClubKind)
  ) {
    return { error: "Completa el nombre, tipo y descripción del club." };
  }
  if (!canModerateClubKind(user, kind)) {
    return { error: "Tu área solo puede registrar clubes del tipo que administra." };
  }
  if (!isUuid(leaderId) || !isUuid(advisorId)) {
    return { error: "Selecciona un alumno responsable y un profesor coordinador." };
  }

  const people = await pool.query<{ id: string; role: string }>(
    "select id, role from users where id = any($1::uuid[]) and is_active",
    [[leaderId, advisorId]],
  );
  if (
    !people.rows.some((p) => p.id === leaderId && p.role === "alumno") ||
    !people.rows.some((p) => p.id === advisorId && p.role === "profesor")
  ) {
    return { error: "Selecciona un alumno y un profesor activos." };
  }

  const inserted = await pool.query<{ id: string }>(
    `insert into clubs (name, kind, description, schedule, contact_email, contact_info, leader_id, advisor_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [
      name,
      kind,
      description,
      schedule || null,
      contactEmail || null,
      contactInfo || null,
      leaderId,
      advisorId,
    ],
  );
  const id = inserted.rows[0].id;
  await audit(user.id, "registrar_directamente", "clubs", id, name);
  refresh(undefined, id);
  redirect(`/clubes/${id}`);
}

export async function createProposal(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Entra con tu cuenta para proponer un club." };
  if (user.role !== "alumno" && user.role !== "profesor") {
    return { error: "Solo un alumno o un profesor puede proponer un club." };
  }

  const name = String(form.get("name") ?? "").trim();
  const kind = String(form.get("kind") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const objectives = String(form.get("objectives") ?? "").trim();
  const schedulePlan = String(form.get("schedule_plan") ?? "").trim();
  const communityImpact = String(form.get("community_impact") ?? "").trim();
  const planRaw = String(form.get("plan_url") ?? "").trim();
  const planFile = form.get("plan_file");

  if (name.length < 3 || name.length > 120) return { error: "Escribe un nombre de 3 a 120 caracteres." };
  if (!KINDS.includes(kind as ClubKind)) return { error: "Elige un tipo: académico, cultural o deportivo." };
  if (description.length < 10 || description.length > 2000) {
    return { error: "La descripción debe tener entre 10 y 2000 caracteres." };
  }
  if (objectives.length < 5 || objectives.length > 2000) {
    return { error: "Indica los objetivos del club (entre 5 y 2000 caracteres)." };
  }
  if (schedulePlan.length < 10 || schedulePlan.length > 2000) {
    return { error: "Describe las actividades a realizar y el cronograma propuesto (mínimo 10 caracteres)." };
  }
  if (communityImpact.length > 2000) {
    return { error: "El impacto comunitario no debe exceder 2000 caracteres." };
  }

  let planUrl: string | null = null;
  if (planRaw) {
    planUrl = safeHttpUrl(planRaw);
    if (!planUrl) return { error: "El enlace del plan debe empezar con http:// o https://." };
  }

  const inserted = await pool.query<{ id: string }>(
    `insert into club_proposals
       (proposer_id, name, kind, description, objectives, schedule_plan, community_impact, plan_url, last_proposer_activity_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now())
     returning id`,
    [user.id, name, kind, description, objectives, schedulePlan, communityImpact, planUrl],
  );
  const id = inserted.rows[0]?.id;
  if (!id) return { error: "No se pudo guardar la propuesta." };

  if (planFile instanceof File && planFile.size > 0) {
    if (planFile.type !== "application/pdf") {
      return { error: "El archivo del plan de trabajo debe ser un PDF." };
    }
    if (planFile.size > 10 * 1024 * 1024) {
      return { error: "El archivo del plan debe pesar 10 MB o menos." };
    }
    const path = `${id}/${user.id}/plan-${randomBytes(6).toString("hex")}.pdf`;
    const supabase = await createSupabaseServerClient();
    const uploaded = await supabase.storage.from("club-documents").upload(path, planFile, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (!uploaded.error) {
      await pool.query("update club_proposals set plan_file_path = $1 where id = $2", [path, id]);
    }
  }

  await audit(user.id, "crear", "club_proposals", id, name);
  refresh(id);
  redirect(`/clubes/propuestas/${id}`);
}

export async function updateProposalDetails(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para actualizar la propuesta." };
  const proposalId = String(form.get("proposal_id") ?? "");
  const objectives = String(form.get("objectives") ?? "").trim();
  const schedulePlan = String(form.get("schedule_plan") ?? "").trim();
  const communityImpact = String(form.get("community_impact") ?? "").trim();

  if (!isUuid(proposalId)) return { error: "No encontramos esa propuesta." };
  if (objectives.length < 5 || objectives.length > 2000) {
    return { error: "Indica los objetivos del club (5 a 2000 caracteres)." };
  }
  if (schedulePlan.length < 10 || schedulePlan.length > 2000) {
    return { error: "Describe las actividades a realizar del club (mínimo 10 caracteres)." };
  }
  if (communityImpact.length > 2000) {
    return { error: "El impacto comunitario no debe exceder 2000 caracteres." };
  }

  const updated = await pool.query(
    `update club_proposals
        set objectives = $1,
            schedule_plan = $2,
            community_impact = $3,
            last_proposer_activity_at = now(),
            updated_at = now()
      where id = $4
        and proposer_id = $5
        and status not in ('registrado', 'rechazada')`,
    [objectives, schedulePlan, communityImpact, proposalId, user.id],
  );
  if (!updated.rowCount) {
    return { error: "Solo quien encabeza la propuesta puede actualizar sus actividades antes del registro." };
  }

  await audit(user.id, "actualizar_actividades_propuesta", "club_proposals", proposalId);
  refresh(proposalId);
  return { success: "Actividades a realizar y datos de la propuesta actualizados." };
}

export async function markInterest(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Entra con tu cuenta para marcar interés." };
  const proposalId = String(form.get("proposal_id") ?? "");
  if (!isUuid(proposalId)) return { error: "No encontramos esa propuesta." };
  try {
    const inserted = await pool.query(
      `insert into club_interests (proposal_id, user_id)
       values ($1, $2) on conflict do nothing returning proposal_id`,
      [proposalId, user.id],
    );
    if (!inserted.rowCount) return { error: "Ya marcaste interés o esta propuesta ya cerró la votación." };
  } catch (error) {
    if (pgCode(error) === "23503") return { error: "No encontramos esa propuesta." };
    if (pgCode(error) === "42501") return { error: "Solo puedes votar en propuestas abiertas de otras personas." };
    throw error;
  }

  await audit(user.id, "interesar", "club_proposals", proposalId);
  refresh(proposalId);
  redirect(`/clubes/propuestas/${proposalId}`);
}

export async function claimInactiveProposal(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para reclamar el seguimiento." };
  const proposalId = String(form.get("proposal_id") ?? "");
  if (!isUuid(proposalId)) return { error: "No encontramos esa propuesta." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("claim_inactive_club_proposal", { p_proposal_id: proposalId });
  if (error || !data) {
    return { error: error?.message ?? "No se pudo tomar el seguimiento. Se requieren 7 días sin actividad del proponente y haber marcado interés." };
  }
  await audit(user.id, "reclamar_propuesta_inactiva", "club_proposals", proposalId);
  refresh(proposalId);
  return { success: "Ahora eres la persona proponente a cargo de continuar esta iniciativa." };
}

export async function sendAdvisorCodeToEmail(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user || (user.role !== "alumno" && user.role !== "profesor")) {
    return { error: "Inicia sesión con tu cuenta institucional." };
  }
  const proposalId = String(form.get("proposal_id") ?? "");
  const advisorEmail = String(form.get("advisor_email") ?? "").trim().toLowerCase();
  if (!isUuid(proposalId)) return { error: "No encontramos esa propuesta." };
  if (!/^[^@]+@ipn\.mx$/.test(advisorEmail) || /^[^@]+@alumno\.ipn\.mx$/.test(advisorEmail)) {
    return { error: "Escribe el correo institucional @ipn.mx del profesor coordinador." };
  }

  const propRes = await pool.query<{ name: string }>(
    "select name from club_proposals where id = $1 and proposer_id = $2",
    [proposalId, user.id],
  );
  const proposalName = propRes.rows[0]?.name;
  if (!proposalName) {
    return { error: "Solo la persona proponente puede enviar la solicitud al profesor coordinador." };
  }

  const code = generateSixCharCode();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("request_club_advisor_code", {
    p_proposal_id: proposalId,
    p_advisor_email: advisorEmail,
    p_code: code,
  });

  if (error || !data || !Array.isArray(data) || !data[0]) {
    return { error: error?.message ?? "No se pudo generar la solicitud para ese profesor." };
  }

  const row = data[0] as { advisor_id: string; advisor_name: string; advisor_email: string };
  const mailResult = await sendMail({
    toEmail: row.advisor_email,
    toName: row.advisor_name,
    subject: `Código de coordinación de club ESCOM · ${proposalName}`,
    text: [
      `Hola, ${row.advisor_name}:`,
      "",
      `${user.name} te invitó a ser profesor coordinador de la propuesta de club «${proposalName}» en la plataforma ESCOM.`,
      "",
      `Tu código de confirmación es: ${code}`,
      "",
      "Si aceptas coordinar y moderar este club, comparte este código con el alumno proponente para que lo ingrese en su petición formal (válido por 24 horas).",
      "Si no aceptas, simplemente ignora este mensaje.",
    ].join("\n"),
    html: `<div style="font-family:sans-serif;color:#173142;line-height:1.5">
      <p>Hola, <strong>${row.advisor_name}</strong>:</p>
      <p><strong>${user.name}</strong> te invitó a ser profesor coordinador de la propuesta de club <strong>«${proposalName}»</strong> en ESCOM.</p>
      <p style="margin:18px 0;padding:14px 18px;background:#eaf4f8;border-left:4px solid #006699;font-size:20px;font-weight:800;letter-spacing:4px;">${code}</p>
      <p>Si aceptas coordinar y moderar este club, entrega este código al estudiante proponente para que lo ingrese en su solicitud (válido por 24 horas).</p>
    </div>`,
  });

  if (!mailResult.ok) {
    return { error: mailResult.error };
  }

  await audit(user.id, "solicitar_codigo_asesor_correo", "club_proposals", proposalId, row.advisor_email);
  refresh(proposalId);
  return {
    success: `Código enviado al correo institucional de ${row.advisor_name} (${row.advisor_email}). Cuando acepte, pídele el código e ingrésalo abajo.`,
  };
}

export async function issueAdvisorCode(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user || user.role !== "profesor") return { error: "Solo un profesor activo puede emitir el código de asesoría." };
  const proposalId = String(form.get("proposal_id") ?? "");
  const code = String(form.get("advisor_code") ?? "").trim().toUpperCase();
  if (!isUuid(proposalId)) return { error: "No encontramos esa propuesta." };
  if (!/^[A-Z0-9]{6}$/.test(code)) return { error: "El código debe tener seis letras o números." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("issue_club_advisor_code", { p_proposal_id: proposalId, p_code: code });
  if (error) return { error: "No se pudo emitir el código. Verifica que la propuesta ya tenga la meta de interesados." };
  await audit(user.id, "emitir_codigo_asesor", "club_proposals", proposalId);
  revalidatePath(`/clubes/propuestas/${proposalId}`);
  return { success: "Código emitido. Compártelo con quien propuso la iniciativa; vence en 24 horas." };
}

export async function verifyAdvisorCode(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user || (user.role !== "alumno" && user.role !== "profesor")) {
    return { error: "Inicia sesión con una cuenta institucional." };
  }
  const proposalId = String(form.get("proposal_id") ?? "");
  const code = String(form.get("advisor_code") ?? "").trim().toUpperCase();
  if (!isUuid(proposalId)) return { error: "No encontramos esa propuesta." };
  if (!/^[A-Z0-9]{6}$/.test(code)) return { error: "El código debe tener seis letras o números." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("verify_club_advisor_code", { p_proposal_id: proposalId, p_code: code });
  if (error || data !== true) return { error: "El código no coincide, venció o ya se usó." };
  await audit(user.id, "confirmar_asesoria", "club_proposals", proposalId);
  refresh(proposalId);
  return { success: "Profesor coordinador confirmado. Cuando los documentos estén completos podrás enviar el registro formal." };
}

const DOCUMENT_TYPES = ["credencial_ipn", "boleta", "firma", "vigencia_ims"] as const;
type ProposalDocumentType = (typeof DOCUMENT_TYPES)[number];
const DOCUMENT_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export async function uploadProposalDocument(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para subir tus documentos." };
  const proposalId = String(form.get("proposal_id") ?? "");
  const documentType = String(form.get("document_type") ?? "") as ProposalDocumentType;
  const file = form.get("document");
  if (!isUuid(proposalId) || !DOCUMENT_TYPES.includes(documentType)) {
    return { error: "La propuesta o el tipo de documento no es válido." };
  }
  if (!(file instanceof File) || file.size === 0) return { error: "Selecciona un archivo PDF, JPG o PNG." };
  if (!DOCUMENT_EXTENSIONS[file.type]) return { error: "Por ahora acepta PDF, JPG o PNG." };
  if (file.size > 10 * 1024 * 1024) return { error: "El archivo debe pesar 10 MB o menos." };

  const path = `${proposalId}/${user.id}/${documentType}-${randomBytes(8).toString("hex")}.${DOCUMENT_EXTENSIONS[file.type]}`;
  const supabase = await createSupabaseServerClient();
  const uploaded = await supabase.storage.from("club-documents").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploaded.error) {
    return { error: "No se pudo subir el archivo. Confirma que eres proponente o marcaste interés y que la propuesta llegó a la meta." };
  }
  try {
    const existing = await pool.query<{ id: string; storage_path: string; status: string }>(
      `select id, storage_path, status from club_proposal_documents
       where proposal_id = $1 and user_id = $2 and document_type = $3`,
      [proposalId, user.id, documentType],
    );
    const oldDocument = existing.rows[0];
    if (oldDocument) {
      if (oldDocument.status !== "requiere_correccion") {
        await supabase.storage.from("club-documents").remove([path]);
        return { error: "Este documento ya fue recibido. Solo puedes reemplazarlo si la coordinación solicita una corrección." };
      }
      const updated = await pool.query(
        `update club_proposal_documents
         set storage_path = $2, status = 'recibido', review_note = null,
             reviewed_by = null, reviewed_at = null, updated_at = now()
         where id = $1 and status = 'requiere_correccion' returning id`,
        [oldDocument.id, path],
      );
      if (!updated.rowCount) {
        await supabase.storage.from("club-documents").remove([path]);
        return { error: "La revisión cambió mientras reemplazabas el documento. Recarga la propuesta." };
      }
      await supabase.storage.from("club-documents").remove([oldDocument.storage_path]);
    } else {
      await pool.query(
        `insert into club_proposal_documents (proposal_id, user_id, document_type, storage_path)
         values ($1, $2, $3, $4)`,
        [proposalId, user.id, documentType, path],
      );
    }
    await pool.query(
      "update club_proposals set last_proposer_activity_at = now() where id = $1 and proposer_id = $2",
      [proposalId, user.id],
    );
  } catch {
    await supabase.storage.from("club-documents").remove([path]);
    return { error: "Se subió el archivo pero no se pudo registrar; inténtalo de nuevo." };
  }
  await audit(user.id, "subir_documento_club", "club_proposal_documents", proposalId, documentType);
  revalidatePath(`/clubes/propuestas/${proposalId}`);
  return { success: "Documento recibido correctamente." };
}

export async function reviewProposalDocument(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para revisar documentos." };
  const proposalId = String(form.get("proposal_id") ?? "");
  const documentId = String(form.get("document_id") ?? "");
  const status = String(form.get("status") ?? "");
  const note = String(form.get("review_note") ?? "").trim().slice(0, 500);
  if (!isUuid(proposalId) || !isUuid(documentId) || !["recibido", "requiere_correccion"].includes(status)) {
    return { error: "La revisión no es válida." };
  }

  const propRes = await pool.query<{ kind: string }>("select kind from club_proposals where id = $1", [proposalId]);
  const prop = propRes.rows[0];
  if (!prop || !canModerateClubKind(user, prop.kind)) {
    return { error: "No tienes permiso para revisar documentos de esta propuesta." };
  }

  const updated = await pool.query<{ id: string; user_id: string }>(
    `update club_proposal_documents set status = $1, review_note = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now()
     where id = $4 and proposal_id = $5 returning id, user_id`,
    [status, note || null, user.id, documentId, proposalId],
  );
  if (!updated.rowCount) return { error: "No se pudo guardar la revisión." };
  if (status === "requiere_correccion" && updated.rows[0]?.user_id) {
    const supabase = await createSupabaseServerClient();
    await supabase.rpc("notify_user_event", {
      p_user_id: updated.rows[0].user_id,
      p_category: "clubes",
      p_title: "Documento de propuesta requiere corrección",
      p_body: note || "Se solicitó reemplazar uno de tus documentos en la solicitud de club.",
      p_href: `/clubes/propuestas/${proposalId}`,
    });
  }
  await audit(user.id, "revisar_documento_club", "club_proposal_documents", documentId, status);
  revalidatePath(`/clubes/propuestas/${proposalId}`);
  return { success: status === "recibido" ? "Documento marcado como correcto." : "Se registró que el documento requiere corrección." };
}

export async function submitFormalClubRequest(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para enviar el registro formal." };
  const proposalId = String(form.get("proposal_id") ?? "");
  const objectives = String(form.get("objectives") ?? "").trim();
  const schedulePlan = String(form.get("schedule_plan") ?? "").trim();
  const communityImpact = String(form.get("community_impact") ?? "").trim();
  const slots = [String(form.get("slot1") ?? ""), String(form.get("slot2") ?? "")]
    .map((value) => new Date(value))
    .filter((value) => Number.isFinite(value.getTime()) && value.getTime() > Date.now());

  if (!isUuid(proposalId)) return { error: "No encontramos esa propuesta." };
  if (objectives.length < 5 || objectives.length > 2000) {
    return { error: "Indica los objetivos del club (5 a 2000 caracteres)." };
  }
  if (schedulePlan.length < 10 || schedulePlan.length > 2000) {
    return { error: "Describe las actividades a realizar del club (mínimo 10 caracteres)." };
  }
  if (slots.length < 1) return { error: "Elige al menos una fecha y hora futura para coordinar la cita." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_formal_club_request", {
    p_proposal_id: proposalId,
    p_objectives: objectives,
    p_schedule_plan: schedulePlan,
    p_community_impact: communityImpact,
    p_slots: slots.map((slot) => slot.toISOString()),
  });
  if (error) {
    return {
      error:
        error.message ||
        "La propuesta aún necesita 20 interesados, documentos completos de todos los participantes, actividades a realizar y profesor coordinador confirmado.",
    };
  }

  await audit(user.id, "enviar_registro_formal_club", "club_proposals", proposalId);
  refresh(proposalId);
  return {
    success:
      "Registro formal enviado. Subdirección / coordinación de clubes ya puede revisar tu petición y confirmar la cita contigo y tu profesor coordinador.",
  };
}

export async function requestClubAppointment(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para solicitar la cita." };
  const proposalId = String(form.get("proposal_id") ?? "");
  const slots = [String(form.get("slot1") ?? ""), String(form.get("slot2") ?? "")]
    .map((value) => new Date(value))
    .filter((value) => Number.isFinite(value.getTime()) && value.getTime() > Date.now());
  if (!isUuid(proposalId)) return { error: "No encontramos esa propuesta." };
  if (slots.length < 1) return { error: "Elige al menos una fecha futura para la cita." };

  const client = await pool.connect();
  try {
    await client.query("begin");
    const appointment = await client.query(
      `insert into club_appointments (proposal_id, requested_by, requested_slots)
       values ($1, $2, $3::jsonb) returning id`,
      [proposalId, user.id, JSON.stringify(slots.map((slot) => slot.toISOString()))],
    );
    if (!appointment.rowCount) throw new Error("No se pudo crear la solicitud de cita.");
    await client.query("update club_proposals set last_proposer_activity_at = now() where id = $1", [proposalId]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    if (pgCode(error) === "42501" || pgCode(error) === "23505") {
      return {
        error:
          "La propuesta aún necesita 20 interesados, profesor coordinador confirmado, actividades y documentos completos; o ya tiene una cita pendiente.",
      };
    }
    return { error: "No se pudo solicitar la cita." };
  } finally {
    client.release();
  }
  await audit(user.id, "solicitar_cita_club", "club_appointments", proposalId);
  refresh(proposalId);
  return { success: "Solicitud de cita enviada." };
}

export async function reviewProposalStatus(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para revisar la propuesta." };
  const proposalId = String(form.get("proposal_id") ?? "");
  const decision = String(form.get("decision") ?? "");
  const observations = String(form.get("observations") ?? "").trim().slice(0, 1000);
  if (!isUuid(proposalId) || !["incompleta", "rechazada", "en_documentacion"].includes(decision)) {
    return { error: "La decisión no es válida." };
  }
  if ((decision === "incompleta" || decision === "rechazada") && observations.length < 5) {
    return { error: "Escribe las observaciones o el motivo (mínimo 5 caracteres)." };
  }

  const propRes = await pool.query<{
    kind: string;
    proposer_id: string;
    name: string;
    formal_submitted_at: Date | null;
  }>("select kind, proposer_id, name, formal_submitted_at from club_proposals where id = $1", [proposalId]);
  const prop = propRes.rows[0];
  if (!prop) return { error: "No encontramos esa propuesta." };
  if (!canModerateClubKind(user, prop.kind)) {
    return { error: "No tienes permiso para revisar una propuesta de este tipo." };
  }
  if (!prop.formal_submitted_at) {
    return { error: "Esta propuesta aún no envía su registro formal." };
  }

  await pool.query(
    `update club_proposals
        set status = $1,
            review_observations = $2,
            updated_at = now()
      where id = $3`,
    [decision, observations || null, proposalId],
  );

  const supabase = await createSupabaseServerClient();
  await supabase.rpc("notify_user_event", {
    p_user_id: prop.proposer_id,
    p_category: "clubes",
    p_title: decision === "rechazada" ? `Propuesta rechazada: ${prop.name}` : `Observaciones en tu propuesta: ${prop.name}`,
    p_body: observations || "Se actualizó el estado de tu propuesta.",
    p_href: `/clubes/propuestas/${proposalId}`,
  });

  await audit(user.id, `marcar_${decision}`, "club_proposals", proposalId, observations);
  refresh(proposalId);
  return {
    success:
      decision === "incompleta"
        ? "Propuesta marcada como incompleta con observaciones."
        : decision === "rechazada"
          ? "Propuesta marcada como rechazada."
          : "Propuesta reabierta a documentación.",
  };
}

export async function decideClubAppointment(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para coordinar la cita." };
  const appointmentId = String(form.get("appointment_id") ?? "");
  const proposalId = String(form.get("proposal_id") ?? "");
  const scheduledAt = new Date(String(form.get("scheduled_at") ?? ""));
  const notes = String(form.get("subdireccion_notes") ?? "").trim().slice(0, 400);

  if (!isUuid(appointmentId) || !isUuid(proposalId) || !Number.isFinite(scheduledAt.getTime())) {
    return { error: "Completa la fecha y hora de la cita." };
  }

  const propRes = await pool.query<{
    kind: string;
    name: string;
    proposer_id: string;
    advisor_id: string | null;
  }>("select kind, name, proposer_id, advisor_id from club_proposals where id = $1", [proposalId]);
  const prop = propRes.rows[0];
  if (!prop || !canModerateClubKind(user, prop.kind)) {
    return { error: "No tienes permiso para confirmar citas de esta propuesta." };
  }

  const defaultPlace = prop.kind === "academico" ? "Sala 14 · Edificio 1" : "Oficina de Clubes Culturales y Deportivos";
  const finalNote = notes || defaultPlace;

  const updated = await pool.query(
    `update club_appointments
     set status = 'confirmada',
         scheduled_at = $1,
         subdireccion_notes = $2,
         reviewed_by = $3,
         reviewed_at = now()
     where id = $4 and proposal_id = $5 and status = 'pendiente'
     returning id`,
    [scheduledAt.toISOString(), finalNote, user.id, appointmentId, proposalId],
  );
  if (!updated.rowCount) return { error: "No pudimos confirmar esta cita." };

  await pool.query(`update club_proposals set status = 'cita_confirmada', updated_at = now() where id = $1`, [proposalId]);

  const whenLabel = new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(scheduledAt);
  const supabase = await createSupabaseServerClient();
  const recipients = [prop.proposer_id, prop.advisor_id].filter((v): v is string => Boolean(v));
  await Promise.all(
    recipients.map((uid) =>
      supabase.rpc("notify_user_event", {
        p_user_id: uid,
        p_category: "clubes",
        p_title: `Cita confirmada para ${prop.name}`,
        p_body: `Fecha: ${whenLabel} · Lugar: ${finalNote}. Deben asistir alumno proponente y profesor coordinador.`,
        p_href: `/clubes/propuestas/${proposalId}`,
      }),
    ),
  );

  await audit(user.id, "confirmar_cita_club", "club_appointments", appointmentId, finalNote);
  refresh(proposalId);
  return {
    success: "Cita confirmada y notificada tanto al alumno proponente como al profesor coordinador.",
  };
}

export async function completeClubAppointment(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para cerrar la cita." };
  const appointmentId = String(form.get("appointment_id") ?? "");
  const proposalId = String(form.get("proposal_id") ?? "");
  if (!isUuid(appointmentId) || !isUuid(proposalId)) return { error: "No encontramos la solicitud." };

  const propRes = await pool.query<{ kind: string }>("select kind from club_proposals where id = $1", [proposalId]);
  const prop = propRes.rows[0];
  if (!prop || !canModerateClubKind(user, prop.kind)) {
    return { error: "No tienes permiso para cerrar la cita de esta propuesta." };
  }

  const updated = await pool.query(
    `update club_appointments set status = 'completada', reviewed_by = $1, reviewed_at = now()
     where id = $2 and proposal_id = $3 and status = 'confirmada' returning id`,
    [user.id, appointmentId, proposalId],
  );
  if (!updated.rowCount) return { error: "La cita debe estar confirmada antes de marcarla como completada." };
  await audit(user.id, "completar_cita_club", "club_appointments", appointmentId);
  refresh(proposalId);
  return { success: "Cita marcada como completada; ya puedes aprobar y registrar el club." };
}

export async function approveProposal(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para registrar el club." };
  const proposalId = String(form.get("proposal_id") ?? "");
  if (!isUuid(proposalId)) return { error: "No encontramos esa propuesta." };

  let clubId = "";
  let proposerId = "";
  let advisorId: string | null = null;
  let clubName = "";
  const client = await pool.connect();
  try {
    await client.query("begin");
    const locked = await client.query<{
      name: string;
      kind: string;
      description: string;
      proposer_id: string;
      advisor_id: string | null;
      status: string;
    }>(
      `select name, kind, description, proposer_id, advisor_id, status
       from club_proposals where id = $1 for update`,
      [proposalId],
    );
    const proposal = locked.rows[0];
    if (!proposal || !canModerateClubKind(user, proposal.kind)) {
      await client.query("rollback");
      return { error: "Solo la coordinación correspondiente de clubes o administración puede registrar este club." };
    }
    if (proposal.status !== "cita_confirmada" || !proposal.advisor_id) {
      await client.query("rollback");
      return { error: "La propuesta requiere profesor coordinador confirmado y cita completada." };
    }

    const appointment = await client.query<{ n: number }>(
      `select count(*)::int as n from club_appointments
       where proposal_id = $1 and status = 'completada'`,
      [proposalId],
    );
    if ((appointment.rows[0]?.n ?? 0) < 1) {
      await client.query("rollback");
      return { error: "Marca primero la cita como completada antes del registro oficial." };
    }

    const existing = await client.query<{ id: string }>(
      `select id from clubs where proposal_id = $1`,
      [proposalId],
    );
    clubId = existing.rows[0]?.id ?? "";
    proposerId = proposal.proposer_id;
    advisorId = proposal.advisor_id;
    clubName = proposal.name;
    if (!clubId) {
      const inserted = await client.query<{ id: string }>(
        `insert into clubs (proposal_id, name, kind, description, leader_id, advisor_id)
         values ($1, $2, $3, $4, $5, $6)
         returning id`,
        [proposalId, proposal.name, proposal.kind, proposal.description, proposal.proposer_id, proposal.advisor_id],
      );
      clubId = inserted.rows[0]?.id ?? "";
    }
    if (!clubId) {
      await client.query("rollback");
      return { error: "No se pudo crear el club." };
    }
    await client.query(
      `update club_proposals set status = 'registrado', review_observations = null, updated_at = now() where id = $1`,
      [proposalId],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  const supabase = await createSupabaseServerClient();
  const votersRes = await pool.query<{ user_id: string }>(
    "select user_id from club_interests where proposal_id = $1",
    [proposalId],
  );
  const recipients = Array.from(
    new Set([proposerId, advisorId, ...votersRes.rows.map((r) => r.user_id)].filter((v): v is string => Boolean(v))),
  );
  await Promise.all(
    recipients.map((uid) =>
      supabase.rpc("notify_user_event", {
        p_user_id: uid,
        p_category: "clubes",
        p_title: `¡Club aprobado y registrado!: ${clubName}`,
        p_body:
          uid === proposerId || uid === advisorId
            ? "El club ya está activo y cuentas con control de moderación."
            : "La propuesta que apoyaste ya es un club oficial en ESCOM. Ya puedes solicitar ingreso.",
        p_href: `/clubes/${clubId}`,
      }),
    ),
  );

  await audit(user.id, "registrar", "clubs", clubId, proposalId);
  refresh(proposalId, clubId);
  redirect(`/clubes/${clubId}`);
}

export async function updateClubDetails(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para editar el club." };
  const clubId = String(form.get("club_id") ?? "");
  const description = String(form.get("description") ?? "").trim();
  const schedule = String(form.get("schedule") ?? "").trim();
  const externalLinks = String(form.get("external_links") ?? "").trim();
  const joinRequirements = String(form.get("join_requirements") ?? "").trim();
  const contactEmail = String(form.get("contact_email") ?? "").trim().slice(0, 160);
  const contactInfo = String(form.get("contact_info") ?? "").trim().slice(0, 400);
  const leaderIdRaw = String(form.get("leader_id") ?? "").trim();
  const advisorIdRaw = String(form.get("advisor_id") ?? "").trim();
  const hasActiveFlag = form.has("active_field");
  const activeFlag = form.get("active") === "on";
  const logoFile = form.get("logo");

  if (!isUuid(clubId)) return { error: "No encontramos ese club." };
  if (description.length < 10 || description.length > 2000) {
    return { error: "La descripción debe tener entre 10 y 2000 caracteres." };
  }

  const currentRes = await pool.query<{
    kind: string;
    leader_id: string | null;
    advisor_id: string | null;
    active: boolean;
  }>("select kind, leader_id, advisor_id, active from clubs where id = $1", [clubId]);
  const current = currentRes.rows[0];
  if (!current) return { error: "No encontramos ese club." };

  const isStaff = canModerateClubKind(user, current.kind);
  const isManager =
    (user.role === "alumno" && user.id === current.leader_id) ||
    (user.role === "profesor" && user.id === current.advisor_id);
  if (!isStaff && !isManager) {
    return { error: "No tienes permiso para editar este club." };
  }

  let logoUrl: string | null = null;
  if (logoFile instanceof File && logoFile.size > 0) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(logoFile.type) || logoFile.size > 5 * 1024 * 1024) {
      return { error: "El logo debe ser JPG, PNG o WEBP de máximo 5 MB." };
    }
    const ext = logoFile.type === "image/jpeg" ? "jpg" : logoFile.type === "image/png" ? "png" : "webp";
    const path = `${user.id}/clubs/${randomBytes(10).toString("hex")}.${ext}`;
    const supabase = await createSupabaseServerClient();
    const uploaded = await supabase.storage.from("public-media").upload(path, logoFile, {
      contentType: logoFile.type,
      upsert: false,
    });
    if (uploaded.error) return { error: "No se pudo subir el logo." };
    logoUrl = supabase.storage.from("public-media").getPublicUrl(path).data.publicUrl;
  }

  const nextLeader = isStaff && isUuid(leaderIdRaw) ? leaderIdRaw : current.leader_id;
  const nextAdvisor = isStaff && isUuid(advisorIdRaw) ? advisorIdRaw : current.advisor_id;
  const nextActive = isStaff && hasActiveFlag ? activeFlag : current.active;

  await pool.query(
    `update clubs
        set description = $1,
            schedule = $2,
            external_links = $3,
            join_requirements = $4,
            contact_email = $5,
            contact_info = $6,
            logo_url = coalesce($7, logo_url),
            leader_id = $8,
            advisor_id = $9,
            active = $10
      where id = $11`,
    [
      description,
      schedule || null,
      externalLinks || null,
      joinRequirements || null,
      contactEmail || null,
      contactInfo || null,
      logoUrl,
      nextLeader,
      nextAdvisor,
      nextActive,
      clubId,
    ],
  );

  await audit(user.id, "editar_club", "clubs", clubId);
  refresh(undefined, clubId);
  return { success: "Información del club actualizada." };
}

export async function createClubEvent(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para proponer un evento del club." };
  const clubId = String(form.get("club_id") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const location = String(form.get("location") ?? "").trim();
  const startsRaw = String(form.get("starts_at") ?? "");
  const startsAt = new Date(startsRaw);

  if (!isUuid(clubId)) return { error: "No encontramos ese club." };
  if (title.length < 3 || title.length > 140) return { error: "El título debe tener entre 3 y 140 caracteres." };
  if (location.length < 2 || location.length > 140) return { error: "Indica el lugar del evento." };
  if (!Number.isFinite(startsAt.getTime())) return { error: "Indica una fecha y hora válidas." };

  const clubRes = await pool.query<{ kind: string; leader_id: string | null; advisor_id: string | null }>(
    "select kind, leader_id, advisor_id from clubs where id = $1 and active",
    [clubId],
  );
  const club = clubRes.rows[0];
  if (!club) return { error: "Ese club no está activo." };

  const isStaff = canModerateClubKind(user, club.kind);
  const isManager =
    (user.role === "alumno" && user.id === club.leader_id) ||
    (user.role === "profesor" && user.id === club.advisor_id);
  if (!isStaff && !isManager) {
    return { error: "Solo el equipo del club o el área de clubes puede registrar eventos." };
  }

  const uploaded = await uploadPublicImage(user.id, "club-events", form.get("image"));
  if ("error" in uploaded) return { error: uploaded.error };

  const status = isStaff ? "aprobado" : "pendiente";
  const approvedBy = isStaff ? user.id : null;

  await pool.query(
    `insert into club_events (club_id, created_by, title, description, starts_at, location, approval_status, approved_by, image_url)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [clubId, user.id, title, description, startsAt.toISOString(), location, status, approvedBy, uploaded.url],
  );

  await audit(user.id, "crear_evento_club", "club_events", clubId, title);
  refresh(undefined, clubId);
  return {
    success: isStaff
      ? "Evento del club publicado y aprobado en la cartelera."
      : "Evento enviado. Quedará visible en la cartelera cuando la coordinación de clubes lo apruebe.",
  };
}

export async function reviewClubEvent(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para revisar eventos." };
  const clubId = String(form.get("club_id") ?? "");
  const eventId = String(form.get("event_id") ?? "");
  const decision = String(form.get("decision") ?? "");
  if (!isUuid(clubId) || !isUuid(eventId) || !["aprobado", "rechazado"].includes(decision)) {
    return { error: "Decisión inválida." };
  }

  const clubRes = await pool.query<{ kind: string }>("select kind from clubs where id = $1", [clubId]);
  const club = clubRes.rows[0];
  if (!club || !canModerateClubKind(user, club.kind)) {
    return { error: "Solo la coordinación correspondiente de clubes o administración puede aprobar eventos." };
  }

  await pool.query(
    `update club_events
        set approval_status = $1,
            approved_by = case when $1 = 'aprobado' then $2::uuid else null end
      where id = $3 and club_id = $4`,
    [decision, user.id, eventId, clubId],
  );

  await audit(user.id, `evento_club_${decision}`, "club_events", eventId, clubId);
  refresh(undefined, clubId);
  return { success: decision === "aprobado" ? "Evento aprobado." : "Evento rechazado." };
}

export async function deleteClubEvent(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para eliminar eventos." };
  const clubId = String(form.get("club_id") ?? "");
  const eventId = String(form.get("event_id") ?? "");
  if (!isUuid(clubId) || !isUuid(eventId)) return { error: "Datos inválidos." };

  const clubRes = await pool.query<{ kind: string; leader_id: string | null; advisor_id: string | null }>(
    "select kind, leader_id, advisor_id from clubs where id = $1",
    [clubId],
  );
  const club = clubRes.rows[0];
  if (!club) return { error: "Club no encontrado." };

  const isStaff = canModerateClubKind(user, club.kind);
  const isManager =
    (user.role === "alumno" && user.id === club.leader_id) ||
    (user.role === "profesor" && user.id === club.advisor_id);
  if (!isStaff && !isManager) return { error: "Sin permiso para eliminar este evento." };

  await pool.query("delete from club_events where id = $1 and club_id = $2", [eventId, clubId]);
  await audit(user.id, "eliminar_evento_club", "club_events", eventId, clubId);
  refresh(undefined, clubId);
  return { success: "Evento eliminado." };
}

export async function requestMembership(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Entra con tu cuenta para solicitar ingreso." };
  const clubId = String(form.get("club_id") ?? "");
  const applicationNote = String(form.get("application_note") ?? "").trim().slice(0, 600);
  if (!isUuid(clubId)) return { error: "No encontramos ese club." };

  const club = await pool.query<{
    leader_id: string | null;
    advisor_id: string | null;
    active: boolean;
    join_requirements: string | null;
  }>(`select leader_id, advisor_id, active, join_requirements from clubs where id = $1`, [clubId]);
  const row = club.rows[0];
  if (!row || !row.active) return { error: "Ese club no está activo." };
  if (user.id === row.leader_id || user.id === row.advisor_id) {
    return { error: "Ya acompañas este club como responsable o coordinador." };
  }
  if (row.join_requirements?.trim() && applicationNote.length < 3) {
    return { error: "Responde los requisitos de ingreso del club antes de enviar tu solicitud." };
  }

  const current = await pool.query<{ status: string }>(
    `select status from memberships where club_id = $1 and user_id = $2`,
    [clubId, user.id],
  );
  const status = current.rows[0]?.status;
  if (status === "pendiente") return { error: "Ya enviaste una solicitud." };
  if (status === "aceptada") return { error: "Ya eres integrante de este club." };

  if (status === "rechazada") {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("resubmit_club_membership", {
      p_club_id: clubId,
      p_note: applicationNote || null,
    });
    if (error || !data) return { error: "No se pudo volver a enviar la solicitud. Recarga la página." };
  } else {
    try {
      await pool.query(
        `insert into memberships (club_id, user_id, status, application_note) values ($1, $2, 'pendiente', $3)`,
        [clubId, user.id, applicationNote || null],
      );
    } catch (error) {
      if (pgCode(error) === "23505") return { error: "Ya enviaste una solicitud." };
      throw error;
    }
  }

  await audit(user.id, "solicitar", "memberships", clubId);
  refresh(undefined, clubId);
  redirect(`/clubes/${clubId}`);
}

export async function decideMembership(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Entra con tu cuenta para continuar." };
  const clubId = String(form.get("club_id") ?? "");
  const memberId = String(form.get("user_id") ?? "");
  const status = String(form.get("status") ?? "");
  if (!isUuid(clubId) || !isUuid(memberId)) return { error: "No encontramos esa solicitud." };
  if (status !== "aceptada" && status !== "rechazada") return { error: "La decisión no es válida." };

  const club = await pool.query<{
    name: string;
    kind: string;
    leader_id: string | null;
    advisor_id: string | null;
    active: boolean;
  }>(`select name, kind, leader_id, advisor_id, active from clubs where id = $1`, [clubId]);
  const row = club.rows[0];
  if (!row || !row.active) return { error: "Ese club no está activo." };

  const isStaff = canModerateClubKind(user, row.kind);
  const isManager =
    (user.role === "alumno" && user.id === row.leader_id) ||
    (user.role === "profesor" && user.id === row.advisor_id);
  if (!isStaff && !isManager) {
    return { error: "Solo el responsable, el coordinador o el área de clubes pueden resolver solicitudes." };
  }

  const updated = await pool.query(
    `update memberships set status = $1
     where club_id = $2 and user_id = $3 and status = 'pendiente'
     returning user_id`,
    [status, clubId, memberId],
  );
  if (!updated.rowCount) return { error: "Esa solicitud ya no está pendiente." };

  const supabase = await createSupabaseServerClient();
  await supabase.rpc("notify_user_event", {
    p_user_id: memberId,
    p_category: "clubes",
    p_title: status === "aceptada" ? `¡Te dieron la bienvenida en ${row.name}!` : `Solicitud de ingreso a ${row.name}`,
    p_body:
      status === "aceptada"
        ? "Tu solicitud fue aceptada; ya puedes consultar las publicaciones internas del club."
        : "Tu solicitud no fue aceptada en esta ocasión.",
    p_href: `/clubes/${clubId}`,
  });

  await audit(user.id, "resolver", "memberships", clubId, status);
  refresh(undefined, clubId);
  redirect(`/clubes/${clubId}`);
}

export async function removeMember(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para gestionar integrantes." };
  const clubId = String(form.get("club_id") ?? "");
  const memberId = String(form.get("user_id") ?? "");
  if (!isUuid(clubId) || !isUuid(memberId)) return { error: "Datos inválidos." };

  const club = await pool.query<{ kind: string; leader_id: string | null; advisor_id: string | null }>(
    "select kind, leader_id, advisor_id from clubs where id = $1",
    [clubId],
  );
  const row = club.rows[0];
  if (!row) return { error: "Club no encontrado." };
  const isStaff = canModerateClubKind(user, row.kind);
  const isManager =
    (user.role === "alumno" && user.id === row.leader_id) ||
    (user.role === "profesor" && user.id === row.advisor_id);
  if (!isStaff && !isManager) return { error: "Sin permiso para retirar integrantes." };
  if (memberId === row.leader_id || memberId === row.advisor_id) {
    return { error: "No puedes retirar al responsable o coordinador asignado." };
  }

  await pool.query("delete from memberships where club_id = $1 and user_id = $2", [clubId, memberId]);
  await audit(user.id, "retirar_integrante", "memberships", clubId, memberId);
  refresh(undefined, clubId);
  return { success: "Integrante retirado del club." };
}

export async function createClubPost(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Entra con tu cuenta para publicar en este club." };

  const clubId = String(form.get("club_id") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  if (!isUuid(clubId)) return { error: "No encontramos ese club." };
  if (title.length < 4 || title.length > 120) return { error: "El título debe tener entre 4 y 120 caracteres." };
  if (body.length < 10 || body.length > 3000) return { error: "La publicación debe tener entre 10 y 3000 caracteres." };

  const access = await pool.query<{
    kind: string;
    active: boolean;
    leader_id: string | null;
    advisor_id: string | null;
  }>(`select kind, active, leader_id, advisor_id from clubs where id = $1`, [clubId]);
  const club = access.rows[0];
  const isStaff = Boolean(club && canModerateClubKind(user, club.kind));
  const isManager = Boolean(
    club &&
      club.active &&
      ((user.role === "alumno" && club.leader_id === user.id) ||
        (user.role === "profesor" && club.advisor_id === user.id)),
  );
  if (!isStaff && !isManager) {
    return { error: "Solo el alumno responsable, el profesor coordinador o el área de clubes pueden publicar." };
  }

  const uploaded = await uploadPublicImage(user.id, "club-posts", form.get("image"));
  if ("error" in uploaded) return { error: uploaded.error };

  const inserted = await pool.query<{ id: string }>(
    `insert into club_posts (club_id, author_id, title, body, image_url)
     values ($1, $2, $3, $4, $5) returning id`,
    [clubId, user.id, title, body, uploaded.url],
  );
  const postId = inserted.rows[0]?.id;
  if (!postId) return { error: "No se pudo publicar. Inténtalo de nuevo." };

  await audit(user.id, "publicar", "club_posts", postId, clubId);
  revalidatePath("/");
  revalidatePath(`/clubes/${clubId}`);
  redirect(`/clubes/${clubId}#publicaciones`);
}

export async function deleteClubPost(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para eliminar publicaciones." };
  const clubId = String(form.get("club_id") ?? "");
  const postId = String(form.get("post_id") ?? "");
  if (!isUuid(clubId) || !isUuid(postId)) return { error: "Datos inválidos." };

  const clubRes = await pool.query<{ kind: string; leader_id: string | null; advisor_id: string | null }>(
    "select kind, leader_id, advisor_id from clubs where id = $1",
    [clubId],
  );
  const club = clubRes.rows[0];
  if (!club) return { error: "Club no encontrado." };
  const isStaff = canModerateClubKind(user, club.kind);
  const isManager =
    (user.role === "alumno" && user.id === club.leader_id) ||
    (user.role === "profesor" && user.id === club.advisor_id);
  if (!isStaff && !isManager) return { error: "Sin permiso para eliminar publicaciones." };

  await pool.query("delete from club_posts where id = $1 and club_id = $2", [postId, clubId]);
  await audit(user.id, "eliminar_post_club", "club_posts", postId, clubId);
  revalidatePath("/");
  revalidatePath(`/clubes/${clubId}`);
  return { success: "Publicación eliminada." };
}
