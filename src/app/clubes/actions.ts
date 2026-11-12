"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, getSession, type SessionUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid, KINDS, safeHttpUrl, type ClubKind, type ClubState } from "./format";

function pgCode(error: unknown) {
  return typeof error === "object" && error && "code" in error ? String(error.code) : "";
}

function canModerate(user: SessionUser) {
  return user.role === "admin" || (user.role === "moderador" && user.area === "clubes_academicos");
}

export async function createClubDirectly(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user || !(user.role === "admin" || (user.role === "moderador" && ["clubes_academicos", "clubes_culturales"].includes(user.area ?? "")))) {
    return { error: "Solo el área de clubes puede registrar un club directamente." };
  }
  const name = String(form.get("name") ?? "").trim();
  const kind = String(form.get("kind") ?? "");
  const description = String(form.get("description") ?? "").trim();
  const leaderId = String(form.get("leader_id") ?? "");
  const advisorId = String(form.get("advisor_id") ?? "");
  if (name.length < 3 || name.length > 120 || description.length < 10 || description.length > 2000 || !KINDS.includes(kind as ClubKind)) return { error: "Completa el nombre, tipo y descripción del club." };
  if (user.area === "clubes_culturales" && kind === "academico") return { error: "Esta área solo registra clubes culturales o deportivos." };
  if (!isUuid(leaderId) || !isUuid(advisorId)) return { error: "Selecciona un alumno responsable y un profesor asesor." };
  const people = await pool.query<{ id: string; role: string }>(
    "select id, role from users where id = any($1::uuid[]) and is_active", [[leaderId, advisorId]],
  );
  if (!people.rows.some((p) => p.id === leaderId && p.role === "alumno") || !people.rows.some((p) => p.id === advisorId && p.role === "profesor")) return { error: "Selecciona un alumno y un profesor activos." };
  const inserted = await pool.query<{ id: string }>(
    "insert into clubs (name, kind, description, leader_id, advisor_id) values ($1, $2, $3, $4, $5) returning id",
    [name, kind, description, leaderId, advisorId],
  );
  const id = inserted.rows[0].id;
  await audit(user.id, "registrar_directamente", "clubs", id, name);
  refresh(undefined, id);
  redirect(`/clubes/${id}`);
}

function canManageAppointments(user: SessionUser) {
  return user.role === "admin" || (user.role === "moderador" && user.area === "subdireccion_academica");
}

function refresh(proposalId?: string, clubId?: string) {
  revalidatePath("/clubes");
  if (proposalId) revalidatePath(`/clubes/propuestas/${proposalId}`);
  if (clubId) revalidatePath(`/clubes/${clubId}`);
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
  const planRaw = String(form.get("plan_url") ?? "").trim();

  if (name.length < 3 || name.length > 120) return { error: "Escribe un nombre de 3 a 120 caracteres." };
  if (!KINDS.includes(kind as ClubKind)) return { error: "Elige un tipo: académico, cultural o deportivo." };
  if (description.length < 10 || description.length > 2000) {
    return { error: "La descripción debe tener entre 10 y 2000 caracteres." };
  }

  let planUrl: string | null = null;
  if (planRaw) {
    planUrl = safeHttpUrl(planRaw);
    if (!planUrl) return { error: "El enlace del plan debe empezar con http:// o https://." };
  }

  const inserted = await pool.query<{ id: string }>(
    `insert into club_proposals (proposer_id, name, kind, description, plan_url)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [user.id, name, kind, description, planUrl],
  );
  const id = inserted.rows[0]?.id;
  if (!id) return { error: "No se pudo guardar la propuesta." };

  await audit(user.id, "crear", "club_proposals", id, name);
  refresh(id);
  redirect(`/clubes/propuestas/${id}`);
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

export async function issueAdvisorCode(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user || user.role !== "profesor") return { error: "Solo un profesor activo puede emitir el código de asesoría." };
  const proposalId = String(form.get("proposal_id") ?? "");
  const code = String(form.get("advisor_code") ?? "").trim().toUpperCase();
  if (!isUuid(proposalId)) return { error: "No encontramos esa propuesta." };
  if (!/^[A-Z0-9]{6}$/.test(code)) return { error: "El código debe tener seis letras o números." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("issue_club_advisor_code", { p_proposal_id: proposalId, p_code: code });
  if (error) return { error: "No se pudo emitir el código. Verifica que la propuesta ya tenga 20 interesados y documentos completos." };
  await audit(user.id, "emitir_codigo_asesor", "club_proposals", proposalId);
  revalidatePath(`/clubes/propuestas/${proposalId}`);
  return { success: "Código emitido. Compártelo con quien propuso la iniciativa; vence en 15 minutos." };
}

export async function verifyAdvisorCode(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user || (user.role !== "alumno" && user.role !== "profesor")) return { error: "Inicia sesión con una cuenta institucional." };
  const proposalId = String(form.get("proposal_id") ?? "");
  const code = String(form.get("advisor_code") ?? "").trim().toUpperCase();
  if (!isUuid(proposalId)) return { error: "No encontramos esa propuesta." };
  if (!/^[A-Z0-9]{6}$/.test(code)) return { error: "El código debe tener seis letras o números." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("verify_club_advisor_code", { p_proposal_id: proposalId, p_code: code });
  if (error || data !== true) return { error: "El código no coincide, venció o ya se usó." };
  await audit(user.id, "confirmar_asesoria", "club_proposals", proposalId);
  revalidatePath(`/clubes/propuestas/${proposalId}`);
  return { success: "Asesoría confirmada. Continúa con la solicitud de cita a Sala 14." };
}

const DOCUMENT_TYPES = ["credencial_ipn", "boleta", "firma", "vigencia_ims"] as const;
type ProposalDocumentType = (typeof DOCUMENT_TYPES)[number];
const DOCUMENT_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png",
};

export async function uploadProposalDocument(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para subir tus documentos." };
  const proposalId = String(form.get("proposal_id") ?? "");
  const documentType = String(form.get("document_type") ?? "") as ProposalDocumentType;
  const file = form.get("document");
  if (!isUuid(proposalId) || !DOCUMENT_TYPES.includes(documentType)) return { error: "La propuesta o el tipo de documento no es válido." };
  if (!(file instanceof File) || file.size === 0) return { error: "Selecciona un archivo PDF, JPG o PNG." };
  if (!DOCUMENT_EXTENSIONS[file.type]) return { error: "Por ahora acepta PDF, JPG o PNG." };
  if (file.size > 10 * 1024 * 1024) return { error: "El archivo debe pesar 10 MB o menos." };

  const path = `${proposalId}/${user.id}/${documentType}-${randomBytes(8).toString("hex")}.${DOCUMENT_EXTENSIONS[file.type]}`;
  const supabase = await createSupabaseServerClient();
  const uploaded = await supabase.storage.from("club-documents").upload(path, file, { contentType: file.type, upsert: false });
  if (uploaded.error) return { error: "No se pudo subir el archivo. Confirma que ya marcaste interés y que la propuesta llegó a 20." };
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
        return { error: "Este documento ya fue recibido. Solo puedes reemplazarlo si Subdirección solicita una corrección." };
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
  } catch {
    await supabase.storage.from("club-documents").remove([path]);
    return { error: "Se subió el archivo pero no se pudo registrar; inténtalo de nuevo." };
  }
  await audit(user.id, "subir_documento_club", "club_proposal_documents", proposalId, documentType);
  revalidatePath(`/clubes/propuestas/${proposalId}`);
  return { success: "Documento recibido; la revisión queda a cargo de Subdirección Académica." };
}

export async function reviewProposalDocument(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user || !canManageAppointments(user)) return { error: "Solo Subdirección Académica puede revisar estos documentos." };
  const proposalId = String(form.get("proposal_id") ?? "");
  const documentId = String(form.get("document_id") ?? "");
  const status = String(form.get("status") ?? "");
  const note = String(form.get("review_note") ?? "").trim().slice(0, 500);
  if (!isUuid(proposalId) || !isUuid(documentId) || !["recibido", "requiere_correccion"].includes(status)) return { error: "La revisión no es válida." };
  const updated = await pool.query(
    `update club_proposal_documents set status = $1, review_note = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now()
     where id = $4 and proposal_id = $5 returning id`,
    [status, note || null, user.id, documentId, proposalId],
  );
  if (!updated.rowCount) return { error: "No se pudo guardar la revisión." };
  await audit(user.id, "revisar_documento_club", "club_proposal_documents", documentId, status);
  revalidatePath(`/clubes/propuestas/${proposalId}`);
  return { success: status === "recibido" ? "Documento marcado como correcto." : "Se registró que el documento requiere corrección." };
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
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    if (pgCode(error) === "42501" || pgCode(error) === "23505") return { error: "La propuesta aún necesita 20 interesados, asesor confirmado y los cuatro documentos completos; o ya tiene una cita pendiente." };
    return { error: "No se pudo solicitar la cita." };
  } finally {
    client.release();
  }
  await audit(user.id, "solicitar_cita_club", "club_appointments", proposalId);
  refresh(proposalId);
  return { success: "Solicitud enviada a Subdirección Académica / Sala 14." };
}

export async function decideClubAppointment(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user || !canManageAppointments(user)) return { error: "Solo Subdirección Académica puede resolver las citas." };
  const appointmentId = String(form.get("appointment_id") ?? "");
  const proposalId = String(form.get("proposal_id") ?? "");
  const scheduledAt = new Date(String(form.get("scheduled_at") ?? ""));
  if (!isUuid(appointmentId) || !isUuid(proposalId) || !Number.isFinite(scheduledAt.getTime())) return { error: "Completa la fecha y la solicitud." };
  const updated = await pool.query(
    `update club_appointments
     set status = 'confirmada', scheduled_at = $1, reviewed_by = $2, reviewed_at = now()
     where id = $3 and proposal_id = $4 and status = 'pendiente' returning id`,
    [scheduledAt.toISOString(), user.id, appointmentId, proposalId],
  );
  if (!updated.rowCount) return { error: "No pudimos confirmar esta cita." };
  await pool.query(`update club_proposals set status = 'cita_confirmada', updated_at = now() where id = $1`, [proposalId]);
  await audit(user.id, "confirmar_cita_club", "club_appointments", appointmentId);
  refresh(proposalId);
  return { success: "Cita confirmada. Después de realizarla, Subdirección puede marcarla como completada." };
}

export async function completeClubAppointment(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user || !canManageAppointments(user)) return { error: "Solo Subdirección Académica puede cerrar la cita." };
  const appointmentId = String(form.get("appointment_id") ?? "");
  const proposalId = String(form.get("proposal_id") ?? "");
  if (!isUuid(appointmentId) || !isUuid(proposalId)) return { error: "No encontramos la solicitud." };
  const updated = await pool.query(
    `update club_appointments set status = 'completada', reviewed_by = $1, reviewed_at = now()
     where id = $2 and proposal_id = $3 and status = 'confirmada' returning id`,
    [user.id, appointmentId, proposalId],
  );
  if (!updated.rowCount) return { error: "La cita debe estar confirmada antes de marcarla como completada." };
  await audit(user.id, "completar_cita_club", "club_appointments", appointmentId);
  refresh(proposalId);
  return { success: "Cita completada; la propuesta queda lista para que moderación de clubes la registre." };
}

export async function approveProposal(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user || !canModerate(user)) {
    return { error: "Solo moderación de clubes académicos o un administrador puede registrar el club." };
  }
  const proposalId = String(form.get("proposal_id") ?? "");
  if (!isUuid(proposalId)) return { error: "No encontramos esa propuesta." };

  let clubId = "";
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
    if (!proposal || proposal.status !== "cita_confirmada" || !proposal.advisor_id) {
      await client.query("rollback");
      return { error: "La propuesta requiere asesor confirmado y una cita completada por Subdirección Académica." };
    }

    const appointment = await client.query<{ n: number }>(
      `select count(*)::int as n from club_appointments
       where proposal_id = $1 and status = 'completada'`,
      [proposalId],
    );
    if ((appointment.rows[0]?.n ?? 0) < 1) {
      await client.query("rollback");
      return { error: "Subdirección debe marcar la cita como completada antes del registro." };
    }

    const existing = await client.query<{ id: string }>(
      `select id from clubs where proposal_id = $1`,
      [proposalId],
    );
    clubId = existing.rows[0]?.id ?? "";
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
    await client.query(`update club_proposals set status = 'registrado' where id = $1`, [proposalId]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  await audit(user.id, "registrar", "clubs", clubId, proposalId);
  refresh(proposalId, clubId);
  redirect(`/clubes/${clubId}`);
}

export async function requestMembership(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Entra con tu cuenta para solicitar ingreso." };
  const clubId = String(form.get("club_id") ?? "");
  if (!isUuid(clubId)) return { error: "No encontramos ese club." };

  const club = await pool.query<{ leader_id: string | null; advisor_id: string | null; active: boolean }>(
    `select leader_id, advisor_id, active from clubs where id = $1`,
    [clubId],
  );
  const row = club.rows[0];
  if (!row || !row.active) return { error: "Ese club no está activo." };
  if (user.id === row.leader_id || user.id === row.advisor_id) {
    return { error: "Ya acompañas este club como responsable o asesor." };
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
    const { data, error } = await supabase.rpc("resubmit_club_membership", { p_club_id: clubId });
    if (error || !data) return { error: "No se pudo volver a enviar la solicitud. Recarga la página." };
  } else {
    try {
      await pool.query(
        `insert into memberships (club_id, user_id, status) values ($1, $2, 'pendiente')`,
        [clubId, user.id],
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

  const club = await pool.query<{ leader_id: string | null; advisor_id: string | null; active: boolean }>(
    `select leader_id, advisor_id, active from clubs where id = $1`,
    [clubId],
  );
  const row = club.rows[0];
  if (!row || !row.active) return { error: "Ese club no está activo." };
  if (!((user.role === "alumno" && user.id === row.leader_id) || (user.role === "profesor" && user.id === row.advisor_id))) {
    return { error: "Solo el responsable o el asesor pueden resolver solicitudes." };
  }

  const updated = await pool.query(
    `update memberships set status = $1
     where club_id = $2 and user_id = $3 and status = 'pendiente'
     returning user_id`,
    [status, clubId, memberId],
  );
  if (!updated.rowCount) return { error: "Esa solicitud ya no está pendiente." };

  await audit(user.id, "resolver", "memberships", clubId, status);
  refresh(undefined, clubId);
  redirect(`/clubes/${clubId}`);
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

  const access = await pool.query<{ can_post: boolean }>(
    `select c.active and (($3 = 'alumno' and c.leader_id = $2) or ($3 = 'profesor' and c.advisor_id = $2)) as can_post
     from clubs c where c.id = $1`,
    [clubId, user.id, user.role],
  );
  if (!access.rows[0]?.can_post) return { error: "Solo el alumno responsable o el profesor asesor de este club pueden publicar." };

  const inserted = await pool.query<{ id: string }>(
    `insert into club_posts (club_id, author_id, title, body)
     values ($1, $2, $3, $4) returning id`,
    [clubId, user.id, title, body],
  );
  const postId = inserted.rows[0]?.id;
  if (!postId) return { error: "No se pudo publicar. Inténtalo de nuevo." };

  await audit(user.id, "publicar", "club_posts", postId, clubId);
  revalidatePath(`/clubes/${clubId}`);
  redirect(`/clubes/${clubId}#publicaciones`);
}
