"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { formatMxDateTime, parseMxLocalDate } from "@/lib/datetime";
import { clubEventVenueArea } from "../espacios/shared";
import { sendMail } from "@/lib/mailer";
import { resolvePreuploadedPrivatePath, resolveUploadedPublicImage } from "@/lib/resolve-upload";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  canManageAnyClubs,
  canModerateClubKind,
  isSseisTitular,
  isUuid,
  KINDS,
  kindLabel,
  safeHttpUrl,
  statusLabel,
  type ClubKind,
  type ClubState,
} from "./format";
import {
  collectAnswersFromForm,
  parseJoinQuestions,
  parseJoinQuestionsFromForm,
} from "./questions";
import { findSimilarClubsOrProposals, type CatalogEntry } from "./similarity";

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
  const objectives = String(form.get("objectives") ?? "").trim();
  const description = String(form.get("description") ?? objectives).trim();
  const schedulePlan = String(form.get("schedule_plan") ?? "").trim();
  const activitiesDetail = String(form.get("activities_detail") ?? "").trim();
  const requestedSpaces = String(form.get("requested_spaces") ?? "").trim();
  const communityImpact = String(form.get("community_impact") ?? "").trim();
  const schedule = String(form.get("schedule") ?? requestedSpaces).trim().slice(0, 160);
  const contactEmail = String(form.get("contact_email") ?? "").trim().slice(0, 160);
  const contactInfo = String(form.get("contact_info") ?? "").trim().slice(0, 400);
  const leaderId = String(form.get("leader_id") ?? "");
  const advisorId = String(form.get("advisor_id") ?? "");
  const foundingMembersCount = Number(form.get("founding_members_count") ?? 0);
  const presidentSemester = Number(form.get("president_semester") ?? 0);
  const presidentIsRegular = form.get("president_is_regular") === "on";

  if (
    name.length < 3 ||
    name.length > 120 ||
    !KINDS.includes(kind as ClubKind)
  ) {
    return { error: "Completa el nombre y tipo del club." };
  }
  if (!canModerateClubKind(user, kind)) {
    return { error: "Tu área solo puede registrar clubes del tipo que administra." };
  }
  if (objectives.length < 10 || objectives.length > 2000) {
    return { error: "Captura el objetivo del club (mínimo 10 caracteres)." };
  }
  if (schedulePlan.length < 10 || schedulePlan.length > 2000) {
    return { error: "Captura el cronograma anual de actividades (mínimo 10 caracteres)." };
  }
  if (activitiesDetail.length < 10 || activitiesDetail.length > 2000) {
    return { error: "Detalla las actividades a realizar (mínimo 10 caracteres)." };
  }
  if (requestedSpaces.length < 3 || requestedSpaces.length > 600) {
    return { error: "Indica los espacios y tiempos solicitados (lunes a viernes de 08:30 a 20:00)." };
  }
  if (communityImpact.length < 10 || communityImpact.length > 2000) {
    return { error: "Describe el impacto académico, cultural o deportivo (mínimo 10 caracteres)." };
  }
  if (!Number.isInteger(foundingMembersCount) || foundingMembersCount < 20) {
    return { error: "Conforme al procedimiento de clubes, el registro requiere al menos 20 estudiantes." };
  }
  if (!Number.isInteger(presidentSemester) || presidentSemester < 3 || presidentSemester > 7 || !presidentIsRegular) {
    return { error: "El alumno presidente debe ser alumno regular entre 3º y 7º semestre." };
  }
  if (!isUuid(leaderId) || !isUuid(advisorId)) {
    return { error: "Selecciona un alumno presidente y un profesor coordinador." };
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

  const supabase = await createSupabaseServerClient();
  let executiveProjectPath = resolvePreuploadedPrivatePath(
    form,
    "executive_project",
    `direct/${user.id}/`,
  );
  const execFile = form.get("executive_project");
  if (!executiveProjectPath && execFile instanceof File && execFile.size > 0) {
    if (execFile.type !== "application/pdf") {
      return { error: "La solicitud y proyecto ejecutivo deben subirse en formato PDF." };
    }
    if (execFile.size > 10 * 1024 * 1024) {
      return { error: "El PDF del proyecto ejecutivo debe pesar 10 MB o menos." };
    }
    const path = `direct/${user.id}/proyecto-${randomBytes(6).toString("hex")}.pdf`;
    const uploaded = await supabase.storage.from("club-documents").upload(path, execFile, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (uploaded.error) return { error: "No se pudo subir el PDF del proyecto ejecutivo." };
    executiveProjectPath = path;
  }
  if (!executiveProjectPath) {
    return { error: "Adjunta el PDF de la solicitud por escrito y proyecto ejecutivo." };
  }

  let foundingRosterPath = resolvePreuploadedPrivatePath(
    form,
    "founding_roster",
    `direct/${user.id}/`,
  );
  const rosterFile = form.get("founding_roster");
  if (!foundingRosterPath && rosterFile instanceof File && rosterFile.size > 0) {
    if (rosterFile.type !== "application/pdf") {
      return { error: "El expediente de los 20+ estudiantes (lista, IMSS, credenciales y firmas) debe estar en PDF." };
    }
    if (rosterFile.size > 10 * 1024 * 1024) {
      return { error: "El PDF del expediente estudiantil debe pesar 10 MB o menos." };
    }
    const path = `direct/${user.id}/padron-${randomBytes(6).toString("hex")}.pdf`;
    const uploaded = await supabase.storage.from("club-documents").upload(path, rosterFile, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (uploaded.error) return { error: "No se pudo subir el PDF del padrón y documentos de integrantes." };
    foundingRosterPath = path;
  }
  if (!foundingRosterPath) {
    return { error: "Adjunta el PDF con la lista de mínimo 20 estudiantes, constancias IMSS, credenciales IPN y firmas." };
  }

  const parsedQuestions = form.has("join_questions_json")
    ? parseJoinQuestionsFromForm(form)
    : { questions: [] };
  if ("error" in parsedQuestions) {
    return { error: parsedQuestions.error };
  }

  const uploadedLogo = await resolveUploadedPublicImage(form, "logo", user.id, "clubs");
  if ("error" in uploadedLogo) {
    return { error: uploadedLogo.error };
  }

  const joinRequirements = String(form.get("join_requirements") ?? "").trim().slice(0, 800);

  const inserted = await pool.query<{ id: string }>(
    `insert into clubs (
       name, kind, description, schedule, contact_email, contact_info,
       leader_id, advisor_id, logo_url, join_requirements, join_questions,
       objectives, schedule_plan, activities_detail, requested_spaces, community_impact,
       executive_project_path, founding_roster_path, founding_members_count,
       president_semester, president_is_regular
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
     returning id`,
    [
      name,
      kind,
      description || objectives,
      schedule || null,
      contactEmail || null,
      contactInfo || null,
      leaderId,
      advisorId,
      uploadedLogo.url,
      joinRequirements || null,
      JSON.stringify(parsedQuestions.questions),
      objectives,
      schedulePlan,
      activitiesDetail,
      requestedSpaces,
      communityImpact,
      executiveProjectPath,
      foundingRosterPath,
      foundingMembersCount,
      presidentSemester,
      presidentIsRegular,
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
  if (user.role !== "alumno") {
    return { error: "Solo un alumno activo puede proponer un nuevo club. Los profesores participan como coordinadores." };
  }

  const name = String(form.get("name") ?? "").trim();
  const kind = String(form.get("kind") ?? "").trim();
  const objectives = String(form.get("objectives") ?? form.get("description") ?? "").trim();
  const forceSimilar = String(form.get("force_similar") ?? "") === "1";

  if (name.length < 3 || name.length > 120) return { error: "Escribe un nombre de 3 a 120 caracteres." };
  if (!KINDS.includes(kind as ClubKind)) return { error: "Elige un tipo: académico, cultural o deportivo." };
  if (objectives.length < 10 || objectives.length > 2000) {
    return { error: "Describe el objetivo del club (entre 10 y 2000 caracteres)." };
  }

  const [clubsRes, proposalsRes] = await Promise.all([
    pool.query<{ id: string; name: string; kind: string; description: string }>(
      "select id, name, kind, description from clubs where active = true",
    ),
    pool.query<{ id: string; name: string; kind: string; description: string; objectives: string; status: string; interested_count: number }>(
      "select id, name, kind, description, objectives, status, interested_count from club_proposals where status not in ('registrado', 'rechazada')",
    ),
  ]);

  const catalog: CatalogEntry[] = [
    ...clubsRes.rows.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      text: c.description,
      type: "club" as const,
      statusLabel: `Club activo · ${kindLabel(c.kind)}`,
    })),
    ...proposalsRes.rows.map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      text: `${p.objectives} ${p.description}`,
      type: "propuesta" as const,
      statusLabel: statusLabel(p.status),
      interests: Number(p.interested_count),
    })),
  ];

  const matches = findSimilarClubsOrProposals(name, objectives, catalog);
  const blocking = matches.find((m) => m.isBlocking);
  if (blocking) {
    return {
      error: `Ya existe una iniciativa muy similar: «${blocking.name}» (${blocking.type === "club" ? "Club activo" : blocking.statusLabel}). Únete o apoya esa comunidad en lugar de duplicarla.`,
    };
  }
  if (matches.length > 0 && !forceSimilar) {
    return {
      error: `Encontramos coincidencias parecidas (por ejemplo «${matches[0].name}»). Verifica que no se repita y confirma para publicar.`,
    };
  }

  const inserted = await pool.query<{ id: string }>(
    `insert into club_proposals
       (proposer_id, name, kind, description, objectives, last_proposer_activity_at)
     values ($1, $2, $3, $4, $5, now())
     returning id`,
    [user.id, name, kind, objectives, objectives],
  );
  const id = inserted.rows[0]?.id;
  if (!id) return { error: "No se pudo guardar la propuesta." };

  await audit(user.id, "crear", "club_proposals", id, name);
  refresh(id);
  redirect(`/clubes/propuestas/${id}`);
}

export async function saveParticipantProfile(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para guardar tus datos." };
  const proposalId = String(form.get("proposal_id") ?? "");
  const career = String(form.get("career") ?? "").trim().slice(0, 120);
  const phone = String(form.get("phone") ?? "").trim().slice(0, 40);

  if (!isUuid(proposalId)) return { error: "No encontramos esa propuesta." };
  if (career.length < 2) return { error: "Indica tu carrera (por ejemplo ISC, IIA o LCD)." };
  if (phone.length < 8) return { error: "Indica un número telefónico de contacto válido." };

  try {
    await pool.query(
      `insert into club_participant_profiles (proposal_id, user_id, career, phone, updated_at)
       values ($1, $2, $3, $4, now())
       on conflict (proposal_id, user_id) do update
         set career = excluded.career,
             phone = excluded.phone,
             updated_at = now()`,
      [proposalId, user.id, career, phone],
    );
  } catch {
    return { error: "No se pudieron guardar tus datos. Verifica que participas en esta propuesta." };
  }

  await audit(user.id, "guardar_datos_integrante_club", "club_participant_profiles", proposalId);
  revalidatePath(`/clubes/propuestas/${proposalId}`);
  return { success: "Datos de integrante guardados." };
}

export async function updateProposalDetails(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para actualizar la propuesta." };
  const proposalId = String(form.get("proposal_id") ?? "");
  const objectives = String(form.get("objectives") ?? "").trim();
  const schedulePlan = String(form.get("schedule_plan") ?? "").trim();
  const activitiesDetail = String(form.get("activities_detail") ?? "").trim();
  const requestedSpaces = String(form.get("requested_spaces") ?? "").trim();
  const communityImpact = String(form.get("community_impact") ?? "").trim();
  const planRaw = String(form.get("plan_url") ?? "").trim();
  const planFile = form.get("plan_file");

  if (!isUuid(proposalId)) return { error: "No encontramos esa propuesta." };
  if (objectives.length < 5 || objectives.length > 2000) {
    return { error: "Indica los objetivos del club (5 a 2000 caracteres)." };
  }
  if (schedulePlan.length < 10 || schedulePlan.length > 2000) {
    return { error: "Describe el cronograma de actividades del club (mínimo 10 caracteres)." };
  }
  if (activitiesDetail.length > 2000) {
    return { error: "El detalle de actividades no debe exceder 2000 caracteres." };
  }
  if (requestedSpaces.length < 3 || requestedSpaces.length > 600) {
    return { error: "Indica qué espacios y horarios de ESCOM ocupará el club." };
  }
  if (communityImpact.length > 2000) {
    return { error: "El impacto comunitario no debe exceder 2000 caracteres." };
  }

  let planUrl: string | null | undefined;
  if (planRaw) {
    const validated = safeHttpUrl(planRaw);
    if (!validated) return { error: "El enlace del plan debe empezar con http:// o https://." };
    planUrl = validated;
  }

  let uploadedPlanPath: string | null = resolvePreuploadedPrivatePath(
    form,
    "plan_file",
    `${proposalId}/${user.id}/`,
  );
  if (!uploadedPlanPath && planFile instanceof File && planFile.size > 0) {
    if (planFile.type !== "application/pdf") {
      return { error: "El archivo del plan de trabajo debe ser un PDF." };
    }
    if (planFile.size > 10 * 1024 * 1024) {
      return { error: "El archivo del plan debe pesar 10 MB o menos." };
    }
    const path = `${proposalId}/${user.id}/plan-${randomBytes(6).toString("hex")}.pdf`;
    const supabase = await createSupabaseServerClient();
    const uploaded = await supabase.storage.from("club-documents").upload(path, planFile, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (uploaded.error) {
      return { error: "No se pudo subir el PDF del plan de trabajo." };
    }
    uploadedPlanPath = path;
  }

  const updated = await pool.query(
    `update club_proposals
        set objectives = $1,
            schedule_plan = $2,
            activities_detail = $3,
            requested_spaces = $4,
            community_impact = $5,
            plan_url = coalesce($6, plan_url),
            plan_file_path = coalesce($7, plan_file_path),
            last_proposer_activity_at = now(),
            updated_at = now()
      where id = $8
        and proposer_id = $9
        and status in ('en_documentacion', 'en_validacion', 'incompleta', 'cita_pendiente')`,
    [
      objectives,
      schedulePlan,
      activitiesDetail,
      requestedSpaces,
      communityImpact,
      planUrl ?? null,
      uploadedPlanPath,
      proposalId,
      user.id,
    ],
  );
  if (!updated.rowCount) {
    return { error: "Solo el alumno responsable puede editar el proyecto ejecutivo una vez reunidas las firmas mínimas." };
  }

  await audit(user.id, "actualizar_actividades_propuesta", "club_proposals", proposalId);
  refresh(proposalId);
  return { success: "Cronograma, espacios y proyecto ejecutivo guardados." };
}

export async function markInterest(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Entra con tu cuenta para marcar interés." };
  if (user.role !== "alumno") {
    return { error: "Solo las cuentas de alumno pueden respaldar una propuesta con su voto." };
  }
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

export async function withdrawInterest(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user || user.role !== "alumno") return { error: "Inicia sesión como alumno." };
  const proposalId = String(form.get("proposal_id") ?? "");
  if (!isUuid(proposalId)) return { error: "No encontramos esa propuesta." };

  const deleted = await pool.query(
    `delete from club_interests ci
      using club_proposals p
     where ci.proposal_id = $1
       and ci.user_id = $2
       and p.id = ci.proposal_id
       and p.status in ('abierta', 'en_documentacion', 'en_validacion', 'incompleta')
     returning ci.proposal_id`,
    [proposalId, user.id],
  );
  if (!deleted.rowCount) {
    return { error: "No se pudo retirar tu respaldo en esta etapa." };
  }
  await audit(user.id, "retirar_interes", "club_proposals", proposalId);
  refresh(proposalId);
  redirect(`/clubes/propuestas/${proposalId}`);
}

export async function claimInactiveProposal(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user || user.role !== "alumno") return { error: "Inicia sesión como alumno participante para tomar el mando." };
  const proposalId = String(form.get("proposal_id") ?? "");
  if (!isUuid(proposalId)) return { error: "No encontramos esa propuesta." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("claim_inactive_club_proposal", { p_proposal_id: proposalId });
  if (error || !data) {
    return {
      error:
        error?.message ||
        "No se pudo tomar el mando. Se requiere que ya haya iniciado la etapa formal, 5 días sin actividad del proponente y ser alumno participante.",
    };
  }
  await audit(user.id, "reclamar_propuesta_inactiva", "club_proposals", proposalId);
  refresh(proposalId);
  redirect(`/clubes/propuestas/${proposalId}`);
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
    success:
      mailResult.channel === "in_app_only"
        ? `Invitación enviada en plataforma a ${row.advisor_name} (${row.advisor_email}). El profesor puede revisar la notificación y emitir su código en esta propuesta.`
        : `Código enviado al correo institucional de ${row.advisor_name} (${row.advisor_email}). Cuando acepte, pídele el código e ingrésalo abajo.`,
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

export async function confirmAdvisorByTeacher(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user || user.role !== "profesor") {
    return { error: "Solo un profesor coordinador invitado puede confirmar la asesoría." };
  }
  const proposalId = String(form.get("proposal_id") ?? "");
  if (!isUuid(proposalId)) return { error: "No encontramos esa propuesta." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("confirm_club_advisor_by_teacher", {
    p_proposal_id: proposalId,
  });
  if (error || !data) {
    return { error: error?.message || "No pudimos confirmar tu invitación como profesor coordinador." };
  }

  await audit(user.id, "confirmar_asesoria_directa", "club_proposals", proposalId);
  refresh(proposalId);
  return {
    success:
      "Confirmaste tu participación como profesor coordinador. Quedaste vinculado en esta solicitud para la junta con Subdirección.",
  };
}

export async function advisorRespondAppointment(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user || user.role !== "profesor") {
    return { error: "Solo el profesor coordinador asignado puede confirmar su asistencia." };
  }
  const proposalId = String(form.get("proposal_id") ?? "");
  const confirm = String(form.get("confirm") ?? "") === "1";
  const note = String(form.get("advisor_note") ?? "").trim().slice(0, 400);
  if (!isUuid(proposalId)) return { error: "No encontramos esa propuesta." };
  if (!confirm && note.length < 4) {
    return { error: "Indica brevemente qué horario te funciona o el motivo del ajuste." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("advisor_respond_appointment", {
    p_proposal_id: proposalId,
    p_confirm: confirm,
    p_note: note || null,
  });
  if (error || !data) {
    return { error: error?.message || "No se pudo registrar tu respuesta sobre la reunión." };
  }

  await audit(user.id, "responder_cita_asesor", "club_appointments", proposalId, confirm ? "confirma" : note);
  refresh(proposalId);
  return {
    success: confirm
      ? "Asistencia a la reunión confirmada. Se notificó a Subdirección."
      : "Solicitud de ajuste de horario enviada a Subdirección.",
  };
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
  const preuploadedPath = resolvePreuploadedPrivatePath(
    form,
    "document",
    `${proposalId}/${user.id}/`,
  );
  const file = form.get("document");
  if (!isUuid(proposalId) || !DOCUMENT_TYPES.includes(documentType)) {
    return { error: "La propuesta o el tipo de documento no es válido." };
  }

  const supabase = await createSupabaseServerClient();
  let path = preuploadedPath ?? "";
  if (!path) {
    if (!(file instanceof File) || file.size === 0) return { error: "Selecciona un archivo PDF, JPG o PNG." };
    if (!DOCUMENT_EXTENSIONS[file.type]) return { error: "Usa PDF, JPG o PNG." };
    if (file.size > 10 * 1024 * 1024) return { error: "El archivo debe pesar 10 MB o menos." };

    path = `${proposalId}/${user.id}/${documentType}-${randomBytes(8).toString("hex")}.${DOCUMENT_EXTENSIONS[file.type]}`;
    const uploaded = await supabase.storage.from("club-documents").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (uploaded.error) {
      return { error: "No se pudo subir el archivo. Confirma que eres proponente o marcaste interés y que la propuesta llegó a la meta." };
    }
  }

  try {
    const propCheck = await pool.query<{ status: string }>(
      `select status from club_proposals
        where id = $1
          and (proposer_id = $2 or exists (
            select 1 from club_interests i where i.proposal_id = $1 and i.user_id = $2
          ))`,
      [proposalId, user.id],
    );
    const propStatus = propCheck.rows[0]?.status;
    if (!propStatus || !["en_documentacion", "en_validacion", "incompleta", "cita_pendiente"].includes(propStatus)) {
      await supabase.storage.from("club-documents").remove([path]);
      return { error: "Esta propuesta ya cerró la recepción o edición de documentos individuales." };
    }

    const existing = await pool.query<{ id: string; storage_path: string; status: string }>(
      `select id, storage_path, status from club_proposal_documents
       where proposal_id = $1 and user_id = $2 and document_type = $3`,
      [proposalId, user.id, documentType],
    );
    const oldDocument = existing.rows[0];
    if (oldDocument) {
      if (oldDocument.status === "validacion_presencial_pendiente") {
        await supabase.storage.from("club-documents").remove([path]);
        return { error: "Este documento ya fue validado; no requiere reemplazo." };
      }
      const updated = await pool.query(
        `update club_proposal_documents
         set storage_path = $2, status = 'recibido', review_note = null,
             reviewed_by = null, reviewed_at = null, updated_at = now()
         where id = $1 returning id`,
        [oldDocument.id, path],
      );
      if (!updated.rowCount) {
        await supabase.storage.from("club-documents").remove([path]);
        return { error: "La revisión cambió mientras reemplazabas el documento. Recarga la propuesta." };
      }
      if (oldDocument.storage_path !== path) {
        await supabase.storage.from("club-documents").remove([oldDocument.storage_path]);
      }
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
  revalidatePath("/notificaciones");
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
  if (!user || user.role !== "alumno") return { error: "Inicia sesión como alumno responsable para enviar el registro formal." };
  const proposalId = String(form.get("proposal_id") ?? "");
  const objectives = String(form.get("objectives") ?? "").trim();
  const schedulePlan = String(form.get("schedule_plan") ?? "").trim();
  const activitiesDetail = String(form.get("activities_detail") ?? "").trim();
  const requestedSpaces = String(form.get("requested_spaces") ?? "").trim();
  const communityImpact = String(form.get("community_impact") ?? "").trim();
  const planRaw = String(form.get("plan_url") ?? "").trim();
  const planFile = form.get("plan_file");
  const presidentSemesterRaw = Number(form.get("president_semester") ?? 0);
  const presidentIsRegular = form.get("president_is_regular") === "on";
  const slots = [String(form.get("slot1") ?? ""), String(form.get("slot2") ?? "")]
    .map((value) => parseMxLocalDate(value))
    .filter((value): value is Date => Boolean(value && value.getTime() > Date.now()));

  if (!isUuid(proposalId)) return { error: "No encontramos esa propuesta." };
  if (objectives.length < 10 || objectives.length > 2000) {
    return { error: "Indica los objetivos del club (10 a 2000 caracteres)." };
  }
  if (schedulePlan.length < 10 || schedulePlan.length > 2000) {
    return { error: "Describe el cronograma anual de actividades del club (mínimo 10 caracteres)." };
  }
  if (activitiesDetail.length < 10 || activitiesDetail.length > 2000) {
    return { error: "Detalla las actividades a desarrollar en el año (mínimo 10 caracteres)." };
  }
  if (requestedSpaces.length < 3 || requestedSpaces.length > 600) {
    return { error: "Indica los espacios y horarios de ESCOM que ocupará el club (lunes a viernes 08:30–20:00)." };
  }
  if (communityImpact.length < 10 || communityImpact.length > 2000) {
    return { error: "Describe el impacto académico, cultural o deportivo para la comunidad ESCOM (mínimo 10 caracteres)." };
  }
  if (!Number.isInteger(presidentSemesterRaw) || presidentSemesterRaw < 3 || presidentSemesterRaw > 7) {
    return { error: "Conforme al procedimiento de clubes, el alumno presidente debe cursar entre 3º y 7º semestre." };
  }
  if (!presidentIsRegular) {
    return { error: "Debes confirmar que el alumno presidente es alumno regular." };
  }

  let planUrl: string | null = null;
  if (planRaw) {
    const validated = safeHttpUrl(planRaw);
    if (!validated) return { error: "El enlace del proyecto ejecutivo debe empezar con http:// o https://." };
    planUrl = validated;
  }

  let uploadedPlanPath: string | null = resolvePreuploadedPrivatePath(
    form,
    "plan_file",
    `${proposalId}/${user.id}/`,
  );
  const supabase = await createSupabaseServerClient();
  if (!uploadedPlanPath && planFile instanceof File && planFile.size > 0) {
    if (planFile.type !== "application/pdf") {
      return { error: "El archivo del plan de trabajo debe ser un PDF." };
    }
    if (planFile.size > 10 * 1024 * 1024) {
      return { error: "El archivo del plan debe pesar 10 MB o menos." };
    }
    const path = `${proposalId}/${user.id}/plan-${randomBytes(6).toString("hex")}.pdf`;
    const uploaded = await supabase.storage.from("club-documents").upload(path, planFile, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (uploaded.error) {
      return { error: "No se pudo subir el PDF del plan de trabajo." };
    }
    uploadedPlanPath = path;
  }

  const { error } = await supabase.rpc("submit_formal_club_request", {
    p_proposal_id: proposalId,
    p_objectives: objectives,
    p_schedule_plan: schedulePlan,
    p_community_impact: communityImpact,
    p_slots: slots.map((slot) => slot.toISOString()),
    p_activities_detail: activitiesDetail,
    p_requested_spaces: requestedSpaces,
    p_plan_url: planUrl,
    p_plan_file_path: uploadedPlanPath,
    p_president_semester: presidentSemesterRaw,
    p_president_is_regular: presidentIsRegular,
  });
  if (error) {
    return {
      error:
        error.message ||
        "La propuesta aún necesita al menos 20 estudiantes con datos y 4 documentos completos (incluyendo al presidente), profesor coordinador confirmado y proyecto ejecutivo.",
    };
  }

  await audit(user.id, "enviar_registro_formal_club", "club_proposals", proposalId);
  refresh(proposalId);
  revalidatePath("/notificaciones");
  return {
    success:
      "Registro formal enviado. El área de clubes revisará los documentos y propondrá fechas disponibles para coordinar la junta contigo y tu profesor coordinador.",
  };
}

export async function proposeClubAppointmentSlots(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para proponer fechas de junta." };
  const proposalId = String(form.get("proposal_id") ?? "");
  const meetingModeRaw = String(form.get("meeting_mode") ?? "presencial").trim();
  const meetingMode = meetingModeRaw === "en_linea" ? "en_linea" : "presencial";
  const meetingLocation = String(form.get("meeting_location") ?? "").trim().slice(0, 300);
  const notes = String(form.get("subdireccion_notes") ?? "").trim().slice(0, 400);

  if (!isUuid(proposalId)) return { error: "No encontramos esa propuesta." };
  if (meetingMode === "en_linea" && meetingLocation && !safeHttpUrl(meetingLocation)) {
    return { error: "Para reunión en línea, proporciona un enlace válido (https://...)." };
  }

  const rawSlots = form.getAll("proposed_slot").map((v) => String(v ?? "").trim()).filter(Boolean);
  const validDates = rawSlots
    .map((v) => parseMxLocalDate(v))
    .filter((d): d is Date => Boolean(d && d.getTime() > Date.now()));
  const uniqueIso = Array.from(new Set(validDates.map((d) => d.toISOString()))).sort();

  if (uniqueIso.length < 1) {
    return { error: "Agrega al menos una fecha y hora futura (CDMX) para que alumno y profesor elijan." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("propose_club_appointment_slots", {
    p_proposal_id: proposalId,
    p_slots: uniqueIso,
    p_meeting_mode: meetingMode,
    p_meeting_location: meetingLocation,
    p_notes: notes,
  });
  if (error) {
    return { error: error.message || "No se pudieron enviar las opciones de horario." };
  }

  await audit(user.id, "proponer_horarios_cita_club", "club_appointments", proposalId, `${uniqueIso.length} opciones`);
  refresh(proposalId);
  revalidatePath("/notificaciones");
  return {
    success: `Se enviaron ${uniqueIso.length} opciones de horario al alumno presidente y al profesor coordinador para acordar fecha.`,
  };
}

export async function respondClubAppointmentSlots(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para responder disponibilidad." };
  const proposalId = String(form.get("proposal_id") ?? "");
  const selectedSlots = form
    .getAll("selected_slots")
    .map((v) => String(v ?? "").trim())
    .filter((v) => !Number.isNaN(Date.parse(v)));
  const note = String(form.get("availability_note") ?? "").trim().slice(0, 400);

  if (!isUuid(proposalId)) return { error: "No encontramos esa propuesta." };
  if (selectedSlots.length < 1 && note.length < 4) {
    return { error: "Selecciona al menos un horario en el que puedas asistir o escribe una nota con tu disponibilidad." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("respond_club_appointment_slots", {
    p_proposal_id: proposalId,
    p_selected_slots: selectedSlots,
    p_note: note || null,
  });
  if (error) {
    return { error: error.message || "No se pudo guardar tu disponibilidad." };
  }

  await audit(user.id, "responder_horarios_cita_club", "club_appointments", proposalId, `${selectedSlots.length} opciones`);
  refresh(proposalId);
  revalidatePath("/notificaciones");
  return {
    success:
      selectedSlots.length > 0
        ? "Disponibilidad registrada. Cuando coincidan los horarios de ambos, coordinación confirmará la fecha definitiva."
        : "Nota de disponibilidad enviada a coordinación de clubes.",
  };
}

export async function requestClubAppointment(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para solicitar la cita." };
  const proposalId = String(form.get("proposal_id") ?? "");
  const slots = [String(form.get("slot1") ?? ""), String(form.get("slot2") ?? "")]
    .map((value) => parseMxLocalDate(value))
    .filter((value): value is Date => Boolean(value && value.getTime() > Date.now()));
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
    advisor_id: string | null;
    name: string;
    formal_submitted_at: Date | null;
  }>("select kind, proposer_id, advisor_id, name, formal_submitted_at from club_proposals where id = $1", [proposalId]);
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

  if (decision === "incompleta" || decision === "rechazada") {
    await pool.query(
      `update club_appointments
          set status = 'cancelada'
        where proposal_id = $1 and status in ('pendiente', 'confirmada')`,
      [proposalId],
    );
  }

  const supabase = await createSupabaseServerClient();
  const recipients = [prop.proposer_id, prop.advisor_id].filter((v): v is string => Boolean(v));
  await Promise.all(
    recipients.map((uid) =>
      supabase.rpc("notify_user_event", {
        p_user_id: uid,
        p_category: "clubes",
        p_title: decision === "rechazada" ? `Propuesta rechazada: ${prop.name}` : `Observaciones en propuesta de club: ${prop.name}`,
        p_body: observations || "Se actualizó el estado de la propuesta.",
        p_href: `/clubes/propuestas/${proposalId}`,
      }),
    ),
  );

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
  const slotChoice = String(form.get("slot_choice") ?? "").trim();
  const scheduledRaw = slotChoice || String(form.get("scheduled_at") ?? "");
  const scheduledAt = parseMxLocalDate(scheduledRaw);
  const meetingModeRaw = String(form.get("meeting_mode") ?? "presencial").trim();
  const meetingMode = meetingModeRaw === "en_linea" ? "en_linea" : "presencial";
  const meetingLocationRaw = String(form.get("meeting_location") ?? "").trim().slice(0, 300);
  const notes = String(form.get("subdireccion_notes") ?? "").trim().slice(0, 400);

  if (!isUuid(appointmentId) || !isUuid(proposalId) || !scheduledAt) {
    return { error: "Selecciona uno de los horarios propuestos o indica fecha y hora válidas." };
  }
  if (meetingMode === "en_linea" && meetingLocationRaw && !safeHttpUrl(meetingLocationRaw)) {
    return { error: "Para reunión en línea, proporciona un enlace válido (https://...) o indícalo en observaciones." };
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

  const defaultPlace =
    meetingMode === "en_linea"
      ? "Videollamada institucional (enlace por correo)"
      : prop.kind === "academico"
        ? "Subdirección Académica / Sala 14 · Edificio 1"
        : "Oficina de Clubes Culturales y Deportivos";
  const meetingLocation = meetingLocationRaw || defaultPlace;
  const finalNote = notes ? `${meetingLocation} · ${notes}` : meetingLocation;

  const updated = await pool.query(
    `update club_appointments
     set status = 'confirmada',
         scheduled_at = $1,
         meeting_mode = $2,
         meeting_location = $3,
         subdireccion_notes = $4,
         reviewed_by = $5,
         reviewed_at = now(),
         advisor_confirmed_at = case
           when scheduled_at is distinct from $1::timestamptz then null
           else advisor_confirmed_at
         end
     where id = $6 and proposal_id = $7 and status in ('pendiente', 'confirmada')
     returning id`,
    [scheduledAt.toISOString(), meetingMode, meetingLocation, finalNote, user.id, appointmentId, proposalId],
  );
  if (!updated.rowCount) return { error: "No pudimos confirmar o reprogramar esta cita." };

  await pool.query(`update club_proposals set status = 'cita_confirmada', updated_at = now() where id = $1`, [proposalId]);

  const whenLabel = formatMxDateTime(scheduledAt);
  const modeLabel = meetingMode === "en_linea" ? "En línea" : "Presencial";
  const supabase = await createSupabaseServerClient();
  const recipients = [prop.proposer_id, prop.advisor_id].filter((v): v is string => Boolean(v));

  const recipientUsers = await pool.query<{ id: string; name: string; email: string }>(
    `select u.id, u.name, up.email
       from public.users u
       join private.user_private up on up.user_id = u.id
      where u.id = any($1::uuid[])`,
    [recipients],
  );

  await Promise.all([
    ...recipients.map((uid) =>
      supabase.rpc("notify_user_event", {
        p_user_id: uid,
        p_category: "clubes",
        p_title: `Cita de club confirmada: ${prop.name}`,
        p_body: `Modalidad: ${modeLabel} · Fecha: ${whenLabel} · Lugar/Enlace: ${meetingLocation}. Asisten alumno proponente y profesor coordinador.`,
        p_href: `/clubes/propuestas/${proposalId}`,
      }),
    ),
    ...recipientUsers.rows.map((person) =>
      sendMail({
        toEmail: person.email,
        toName: person.name,
        subject: `Junta confirmada · Propuesta de club ${prop.name}`,
        text: [
          `Hola, ${person.name}:`,
          "",
          `Se confirmó la reunión conjunta para revisar la solicitud del club «${prop.name}».`,
          `• Fecha y hora (CDMX): ${whenLabel}`,
          `• Modalidad: ${modeLabel}`,
          `• Lugar o enlace: ${meetingLocation}`,
          notes ? `• Indicaciones: ${notes}` : "",
          "",
          "Por favor confirma tu asistencia o revisa los detalles dentro de la plataforma ESCOM.",
        ]
          .filter(Boolean)
          .join("\n"),
      }),
    ),
  ]);

  await audit(user.id, "confirmar_cita_club", "club_appointments", appointmentId, finalNote);
  refresh(proposalId);
  revalidatePath("/notificaciones");
  return {
    success: `Cita ${modeLabel.toLowerCase()} confirmada (${whenLabel}) y notificada tanto al alumno proponente como al profesor coordinador.`,
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
      objectives: string;
      schedule_plan: string;
      activities_detail: string;
      requested_spaces: string;
      community_impact: string;
      plan_file_path: string | null;
      president_semester: number | null;
      president_is_regular: boolean;
      interested_count: number;
      proposer_id: string;
      advisor_id: string | null;
      status: string;
    }>(
      `select name, kind, description, objectives, schedule_plan, activities_detail, requested_spaces,
              community_impact, plan_file_path, president_semester, president_is_regular, interested_count,
              proposer_id, advisor_id, status
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
      const clubDescription = (proposal.objectives || proposal.description).trim().slice(0, 2000);
      const scheduleSummary =
        (proposal.requested_spaces.trim() || proposal.schedule_plan.trim()).slice(0, 160) || null;
      const foundingCount = Math.max(20, Number(proposal.interested_count) + 1);
      const inserted = await client.query<{ id: string }>(
        `insert into clubs (
           proposal_id, name, kind, description, schedule, leader_id, advisor_id,
           objectives, schedule_plan, activities_detail, requested_spaces, community_impact,
           executive_project_path, founding_members_count, president_semester, president_is_regular
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         returning id`,
        [
          proposalId,
          proposal.name,
          proposal.kind,
          clubDescription,
          scheduleSummary,
          proposal.proposer_id,
          proposal.advisor_id,
          proposal.objectives,
          proposal.schedule_plan,
          proposal.activities_detail,
          proposal.requested_spaces,
          proposal.community_impact,
          proposal.plan_file_path,
          foundingCount,
          proposal.president_semester,
          proposal.president_is_regular,
        ],
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

  if (!isUuid(clubId)) return { error: "No encontramos ese club." };
  if (description.length < 10 || description.length > 2000) {
    return { error: "La descripción debe tener entre 10 y 2000 caracteres." };
  }

  const parsedQuestions = form.has("join_questions_json")
    ? parseJoinQuestionsFromForm(form)
    : null;
  if (parsedQuestions && "error" in parsedQuestions) {
    return { error: parsedQuestions.error };
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

  const uploadedLogo = await resolveUploadedPublicImage(form, "logo", user.id, "clubs");
  if ("error" in uploadedLogo) {
    return { error: uploadedLogo.error };
  }

  let nextLeader = current.leader_id;
  if (isStaff && isUuid(leaderIdRaw)) {
    const chk = await pool.query<{ ok: boolean }>(
      "select exists (select 1 from users where id = $1 and role = 'alumno' and is_active) as ok",
      [leaderIdRaw],
    );
    if (!chk.rows[0]?.ok) return { error: "El responsable debe ser un alumno activo." };
    nextLeader = leaderIdRaw;
  }

  let nextAdvisor = current.advisor_id;
  if (isStaff && isUuid(advisorIdRaw)) {
    const chk = await pool.query<{ ok: boolean }>(
      "select exists (select 1 from users where id = $1 and role = 'profesor' and is_active) as ok",
      [advisorIdRaw],
    );
    if (!chk.rows[0]?.ok) return { error: "El coordinador debe ser un profesor activo." };
    nextAdvisor = advisorIdRaw;
  }

  const nextActive = isStaff && hasActiveFlag ? activeFlag : current.active;

  await pool.query(
    `update clubs
        set description = $1,
            schedule = $2,
            external_links = $3,
            join_requirements = $4,
            join_questions = coalesce($5::jsonb, join_questions),
            contact_email = $6,
            contact_info = $7,
            logo_url = coalesce($8, logo_url),
            leader_id = $9,
            advisor_id = $10,
            active = $11
      where id = $12`,
    [
      description,
      schedule || null,
      externalLinks || null,
      joinRequirements || null,
      parsedQuestions ? JSON.stringify(parsedQuestions.questions) : null,
      contactEmail || null,
      contactInfo || null,
      uploadedLogo.url,
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
  const startsAt = parseMxLocalDate(String(form.get("starts_at") ?? ""));
  const endsRaw = String(form.get("ends_at") ?? "").trim();
  const endsAt = endsRaw ? parseMxLocalDate(endsRaw) : null;

  if (!isUuid(clubId)) return { error: "No encontramos ese club." };
  if (title.length < 3 || title.length > 140) return { error: "El título debe tener entre 3 y 140 caracteres." };
  if (location.length < 2 || location.length > 140) return { error: "Indica el lugar del evento." };
  if (!startsAt) return { error: "Indica una fecha y hora de inicio válidas." };
  if (endsRaw && (!endsAt || endsAt <= startsAt)) {
    return { error: "La hora de cierre debe ser posterior al inicio del evento." };
  }

  const clubRes = await pool.query<{ kind: string; leader_id: string | null; advisor_id: string | null }>(
    "select kind, leader_id, advisor_id from clubs where id = $1 and active",
    [clubId],
  );
  const club = clubRes.rows[0];
  if (!club) return { error: "Ese club no está activo." };

  const isManager =
    (user.role === "alumno" && user.id === club.leader_id) ||
    (user.role === "profesor" && user.id === club.advisor_id);
  if (!isManager) {
    return { error: "Solo el alumno responsable o profesor coordinador de este club puede registrar eventos." };
  }

  // Verificar traslape contra espacios oficiales del campus (Auditorio, Sala 14, El domo, Canchas, Explanada...)
  const spaceNameKey = location.split("·")[0]?.trim() ?? location;
  const overlap = await pool.query<{ conflict_title: string | null }>(
    `select public.check_space_event_overlap(s.id, $2::timestamptz, $3::timestamptz, null) as conflict_title
       from spaces s
      where lower(trim(s.name)) = lower(trim($1))
      limit 1`,
    [spaceNameKey, startsAt.toISOString(), endsAt ? endsAt.toISOString() : null],
  );
  const conflict = overlap.rows[0]?.conflict_title;
  if (conflict) {
    return {
      error: `Ese espacio ya tiene otro evento en ese horario («${conflict}»). Ajusta la hora o elige otra sede.`,
    };
  }

  const uploaded = await resolveUploadedPublicImage(form, "image", user.id, "club-events");
  if ("error" in uploaded) return { error: uploaded.error };

  const status = "pendiente";
  const approvedBy = null;

  await pool.query(
    `insert into club_events (club_id, created_by, title, description, starts_at, ends_at, location, approval_status, approved_by, image_url)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      clubId,
      user.id,
      title,
      description,
      startsAt.toISOString(),
      endsAt ? endsAt.toISOString() : null,
      location,
      status,
      approvedBy,
      uploaded.url,
    ],
  );

  await audit(user.id, "crear_evento_club", "club_events", clubId, title);
  refresh(undefined, clubId);
  return {
    success: "Evento enviado. Quedará visible en la cartelera cuando el área responsable lo apruebe.",
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

  const evRes = await pool.query<{ location: string; kind: string }>(
    `select ce.location, c.kind
       from club_events ce
       join clubs c on c.id = ce.club_id
      where ce.id = $1 and ce.club_id = $2 and ce.approval_status = 'pendiente'`,
    [eventId, clubId],
  );
  const ev = evRes.rows[0];
  if (!ev) return { error: "El evento no existe o ya fue revisado." };

  const venueArea = clubEventVenueArea(ev.location);
  const canReview = venueArea
    ? user.role === "admin" || (user.role === "moderador" && user.area === venueArea)
    : canModerateClubKind(user, ev.kind);
  if (!canReview) {
    return { error: "Este evento corresponde a otra área para su autorización." };
  }

  if (decision === "aprobado") {
    const overlap = await pool.query<{ conflict_title: string | null }>(
      `select public.check_space_event_overlap(s.id, ce.starts_at, ce.ends_at, ce.id) as conflict_title
         from club_events ce
         join spaces s on lower(trim(s.name)) = lower(trim(split_part(ce.location, '·', 1)))
        where ce.id = $1 and ce.club_id = $2
        limit 1`,
      [eventId, clubId],
    );
    const conflict = overlap.rows[0]?.conflict_title;
    if (conflict) {
      return {
        error: `No se puede aprobar porque el espacio se traslapa con «${conflict}».`,
      };
    }
  }

  const updated = await pool.query(
    `update club_events
        set approval_status = $1,
            approved_by = case when $1 = 'aprobado' then $2::uuid else null end
      where id = $3 and club_id = $4 and approval_status = 'pendiente'`,
    [decision, user.id, eventId, clubId],
  );
  if (!updated.rowCount) return { error: "El evento ya fue revisado." };
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

  const evRes = await pool.query<{
    kind: string;
    leader_id: string | null;
    advisor_id: string | null;
    location: string;
  }>(
    `select c.kind, c.leader_id, c.advisor_id, ce.location
       from club_events ce
       join clubs c on c.id = ce.club_id
      where ce.id = $1 and ce.club_id = $2`,
    [eventId, clubId],
  );
  const row = evRes.rows[0];
  if (!row) return { error: "Evento o club no encontrado." };

  const isStaff = canModerateClubKind(user, row.kind);
  const isManager =
    (user.role === "alumno" && user.id === row.leader_id) ||
    (user.role === "profesor" && user.id === row.advisor_id);
  const venueArea = clubEventVenueArea(row.location);
  const isVenueStaff = Boolean(
    venueArea && (user.role === "admin" || (user.role === "moderador" && user.area === venueArea)),
  );
  if (!isManager && !isStaff && !isVenueStaff) {
    return { error: "Sin permiso para eliminar este evento." };
  }

  const deleted = await pool.query(
    `delete from club_events where id = $1 and club_id = $2`,
    [eventId, clubId],
  );
  if (!deleted.rowCount) return { error: "No se pudo eliminar este evento." };
  await audit(user.id, "eliminar_evento_club", "club_events", eventId, clubId);
  refresh(undefined, clubId);
  return { success: "Evento eliminado." };
}

export async function requestMembership(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Entra con tu cuenta para solicitar ingreso." };
  if (user.role !== "alumno") {
    return { error: "Solo los alumnos pueden solicitar ingreso como integrantes de un club." };
  }
  const clubId = String(form.get("club_id") ?? "");
  const applicationNote = String(form.get("application_note") ?? "").trim().slice(0, 600);
  if (!isUuid(clubId)) return { error: "No encontramos ese club." };

  const club = await pool.query<{
    name: string;
    leader_id: string | null;
    advisor_id: string | null;
    active: boolean;
    join_requirements: string | null;
    join_questions: unknown;
  }>(`select name, leader_id, advisor_id, active, join_requirements, join_questions from clubs where id = $1`, [clubId]);
  const row = club.rows[0];
  if (!row || !row.active) return { error: "Ese club no está activo." };
  if (user.id === row.leader_id || user.id === row.advisor_id) {
    return { error: "Ya acompañas este club como responsable o coordinador." };
  }

  const questions = parseJoinQuestions(row.join_questions);
  const answersResult = collectAnswersFromForm(questions, form);
  if ("error" in answersResult) {
    return { error: answersResult.error };
  }
  if (questions.length === 0 && row.join_requirements?.trim() && applicationNote.length < 3) {
    return { error: "Responde los requisitos de ingreso del club antes de enviar tu solicitud." };
  }

  const finalNote = (applicationNote || answersResult.summary).trim().slice(0, 600) || null;
  const answersJson = JSON.stringify(answersResult.answers);

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
      p_note: finalNote,
      p_answers: answersResult.answers,
    });
    if (error || !data) return { error: "No se pudo volver a enviar la solicitud. Recarga la página." };
  } else {
    try {
      await pool.query(
        `insert into memberships (club_id, user_id, status, application_note, application_answers)
         values ($1, $2, 'pendiente', $3, $4::jsonb)`,
        [clubId, user.id, finalNote, answersJson],
      );
    } catch (error) {
      if (pgCode(error) === "23505") return { error: "Ya enviaste una solicitud." };
      throw error;
    }
  }

  const supabase = await createSupabaseServerClient();
  const reviewers = [row.leader_id, row.advisor_id].filter((v): v is string => Boolean(v));
  await Promise.all(
    reviewers.map((uid) =>
      supabase.rpc("notify_user_event", {
        p_user_id: uid,
        p_category: "clubes",
        p_title: `Nueva solicitud de ingreso: ${row.name}`,
        p_body: `${user.name} respondió el filtro de ingreso y solicita unirse al club.`,
        p_href: `/clubes/${clubId}#solicitudes`,
      }),
    ),
  );

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
  const isManager = Boolean(
    club &&
      club.active &&
      ((user.role === "alumno" && club.leader_id === user.id) ||
        (user.role === "profesor" && club.advisor_id === user.id)),
  );
  if (!isManager) {
    return { error: "Solo el alumno moderador o profesor coordinador de su propio club puede publicar aquí." };
  }

  const uploaded = await resolveUploadedPublicImage(form, "image", user.id, "club-posts");
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
  if (String(form.get("stay_on_page") ?? "") === "1") {
    return { success: "Publicación agregada al club." };
  }
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

export async function updateClubLogo(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para cambiar el logo." };
  const clubId = String(form.get("club_id") ?? "");
  if (!isUuid(clubId)) return { error: "No encontramos ese club." };

  const currentRes = await pool.query<{
    kind: string;
    leader_id: string | null;
    advisor_id: string | null;
    active: boolean;
  }>("select kind, leader_id, advisor_id, active from clubs where id = $1", [clubId]);
  const club = currentRes.rows[0];
  if (!club) return { error: "No encontramos ese club." };

  const isStaff = canModerateClubKind(user, club.kind);
  const isManager =
    club.active &&
    ((user.role === "alumno" && user.id === club.leader_id) ||
      (user.role === "profesor" && user.id === club.advisor_id));
  if (!isStaff && !isManager) {
    return { error: "Sin permiso para cambiar el logo de este club." };
  }

  const uploaded = await resolveUploadedPublicImage(form, "logo", user.id, "clubs");
  if ("error" in uploaded) return { error: uploaded.error };
  if (!uploaded.url) return { error: "Selecciona una imagen JPG, PNG o WEBP para el logo." };

  await pool.query("update clubs set logo_url = $1 where id = $2", [uploaded.url, clubId]);
  await audit(user.id, "actualizar_logo_club", "clubs", clubId);
  refresh(undefined, clubId);
  return { success: "Logo actualizado." };
}

export async function assignSseisDelegate(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user || !isSseisTitular(user)) {
    return { error: "Solo la titularidad de SSEIS o Administración puede designar responsables de clubes culturales y deportivos." };
  }
  const targetId = String(form.get("user_id") ?? "");
  const note = String(form.get("note") ?? "").trim().slice(0, 300);
  if (!isUuid(targetId)) return { error: "Selecciona una profesora o miembro del personal activo." };

  const targetRes = await pool.query<{ id: string; name: string; role: string }>(
    "select id, name, role from users where id = $1 and is_active and role in ('profesor', 'moderador')",
    [targetId],
  );
  const target = targetRes.rows[0];
  if (!target) {
    return { error: "La persona designada debe ser una cuenta activa de profesor o personal." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("sseis_set_club_delegate", {
      p_user_id: targetId,
      p_active: true,
      p_note: note || null,
    });
    if (error) {
      const updated = await pool.query(
        `update public.club_area_delegates
            set assigned_by = $2, active = true, note = $3, updated_at = now()
          where user_id = $1 and area_group = 'cultural_deportivo'`,
        [targetId, user.id, note || ""],
      );
      if (!updated.rowCount) {
        await pool.query(
          `insert into public.club_area_delegates (area_group, user_id, assigned_by, active, note)
           values ('cultural_deportivo', $1, $2, true, $3)`,
          [targetId, user.id, note || ""],
        );
      }
    }
  } catch {
    return { error: "Aplica la migración pendiente para habilitar la designación SSEIS en base de datos." };
  }

  await audit(user.id, "designar_responsable_sseis", "club_area_delegates", targetId, target.name);
  refresh();
  return { success: `${target.name} quedó designada(o) para gestionar clubes culturales y deportivos.` };
}

export async function revokeSseisDelegate(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user || !isSseisTitular(user)) {
    return { error: "Solo SSEIS o Administración puede revocar esta designación." };
  }
  const targetId = String(form.get("user_id") ?? "");
  if (!isUuid(targetId)) return { error: "Cuenta inválida." };

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("sseis_set_club_delegate", {
      p_user_id: targetId,
      p_active: false,
      p_note: null,
    });
    if (error) {
      await pool.query(
        `update public.club_area_delegates
            set active = false, updated_at = now()
          where user_id = $1 and area_group = 'cultural_deportivo'`,
        [targetId],
      );
    }
  } catch {
    return { error: "No se pudo actualizar la designación SSEIS." };
  }

  await audit(user.id, "revocar_responsable_sseis", "club_area_delegates", targetId);
  refresh();
  return { success: "Designación retirada." };
}
