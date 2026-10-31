"use server";

import { randomBytes, timingSafeEqual } from "crypto";
import type { PoolClient } from "pg";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, getSession, type SessionUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { isUuid, KINDS, safeHttpUrl, type ClubKind, type ClubState } from "./format";

function pgCode(error: unknown) {
  return typeof error === "object" && error && "code" in error ? String(error.code) : "";
}

function makeAdvisorCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let code = "";
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return code;
}

function sameCode(given: string, stored: string) {
  const left = Buffer.from(given);
  const right = Buffer.from(stored.trim().toUpperCase());
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

function canModerate(user: SessionUser) {
  return user.role === "admin" || (user.role === "moderador" && user.area === "clubes_academicos");
}

function refresh(proposalId?: string, clubId?: string) {
  revalidatePath("/clubes");
  if (proposalId) revalidatePath(`/clubes/propuestas/${proposalId}`);
  if (clubId) revalidatePath(`/clubes/${clubId}`);
}

async function notifyProposer(client: PoolClient, proposerId: string, proposalId: string, name: string, code: string) {
  await client.query(
    `insert into notifications (user_id, title, body, href)
     values ($1, $2, $3, $4)`,
    [
      proposerId,
      "Tu propuesta alcanzó 20 interesados",
      `La propuesta «${name}» ya puede buscar asesor. Comparte este código con un profesor: ${code}.`,
      `/clubes/propuestas/${proposalId}`,
    ],
  );
}

async function promoteIfReady(client: PoolClient, proposalId: string, status: string, name: string, proposerId: string, count: number) {
  if (count < 20 || status !== "abierta") return;
  const updated = await client.query<{ advisor_code: string }>(
    `update club_proposals
     set status = 'en_seguimiento',
         advisor_code = coalesce(advisor_code, $2)
     where id = $1 and status = 'abierta'
     returning advisor_code`,
    [proposalId, makeAdvisorCode()],
  );
  const code = updated.rows[0]?.advisor_code;
  if (!code) return;
  await notifyProposer(client, proposerId, proposalId, name, code);
  return true;
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

  const client = await pool.connect();
  let promoted = false;
  try {
    await client.query("begin");
    const locked = await client.query<{ status: string; name: string; proposer_id: string }>(
      `select status, name, proposer_id from club_proposals where id = $1 for update`,
      [proposalId],
    );
    const proposal = locked.rows[0];
    if (!proposal) {
      await client.query("rollback");
      return { error: "No encontramos esa propuesta." };
    }

    const inserted = await client.query(
      `insert into club_interests (proposal_id, user_id)
       values ($1, $2)
       on conflict do nothing
       returning proposal_id`,
      [proposalId, user.id],
    );
    if (!inserted.rowCount) {
      await client.query("rollback");
      return { error: "Ya marcaste interés en esta propuesta." };
    }

    const count = await client.query<{ n: number }>(
      `select count(*)::int as n from club_interests where proposal_id = $1`,
      [proposalId],
    );
    promoted = Boolean(
      await promoteIfReady(client, proposalId, proposal.status, proposal.name, proposal.proposer_id, count.rows[0]?.n ?? 0),
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    if (pgCode(error) === "23503") return { error: "No encontramos esa propuesta." };
    throw error;
  } finally {
    client.release();
  }

  await audit(user.id, "interesar", "club_proposals", proposalId, promoted ? "umbral" : undefined);
  refresh(proposalId);
  redirect(`/clubes/propuestas/${proposalId}`);
}

export async function simulateThreshold(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user) return { error: "Entra con tu cuenta para continuar." };
  const proposalId = String(form.get("proposal_id") ?? "");
  if (!isUuid(proposalId)) return { error: "No encontramos esa propuesta." };

  const client = await pool.connect();
  try {
    await client.query("begin");
    const locked = await client.query<{
      proposer_id: string;
      name: string;
      status: string;
    }>(
      `select proposer_id, name, status from club_proposals where id = $1 for update`,
      [proposalId],
    );
    const proposal = locked.rows[0];
    if (!proposal) {
      await client.query("rollback");
      return { error: "No encontramos esa propuesta." };
    }
    if (user.id !== proposal.proposer_id && user.role !== "admin") {
      await client.query("rollback");
      return { error: "Solo quien propone o un administrador puede simular el umbral." };
    }
    if (proposal.status !== "abierta") {
      await client.query("rollback");
      return { error: "La propuesta ya no está abierta." };
    }

    const updated = await client.query<{ advisor_code: string }>(
      `update club_proposals
       set status = 'en_seguimiento',
           advisor_code = coalesce(advisor_code, $2)
       where id = $1 and status = 'abierta'
       returning advisor_code`,
      [proposalId, makeAdvisorCode()],
    );
    const code = updated.rows[0]?.advisor_code;
    if (!code) {
      await client.query("rollback");
      return { error: "No se pudo pasar la propuesta a seguimiento." };
    }
    await notifyProposer(client, proposal.proposer_id, proposalId, proposal.name, code);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  await audit(user.id, "seguimiento", "club_proposals", proposalId, "simulado");
  refresh(proposalId);
  redirect(`/clubes/propuestas/${proposalId}`);
}

export async function claimAdvisor(_prev: ClubState, form: FormData): Promise<ClubState> {
  const user = await getSession();
  if (!user || user.role !== "profesor") return { error: "Solo un profesor puede asesorar un club." };
  const proposalId = String(form.get("proposal_id") ?? "");
  const given = String(form.get("advisor_code") ?? "").trim().toUpperCase();
  if (!isUuid(proposalId)) return { error: "No encontramos esa propuesta." };
  if (!/^[A-Z0-9]{6}$/.test(given)) return { error: "El código de asesor tiene 6 caracteres." };

  const client = await pool.connect();
  try {
    await client.query("begin");
    const locked = await client.query<{ status: string; advisor_code: string | null }>(
      `select status, advisor_code from club_proposals where id = $1 for update`,
      [proposalId],
    );
    const proposal = locked.rows[0];
    if (!proposal || proposal.status !== "en_seguimiento" || !proposal.advisor_code) {
      await client.query("rollback");
      return { error: "Esta propuesta no está esperando asesor." };
    }
    if (!sameCode(given, proposal.advisor_code)) {
      await client.query("rollback");
      return { error: "El código no coincide." };
    }
    const updated = await client.query(
      `update club_proposals
       set advisor_id = $1, status = 'con_asesor'
       where id = $2 and status = 'en_seguimiento' and advisor_code = $3
       returning id`,
      [user.id, proposalId, proposal.advisor_code],
    );
    if (!updated.rowCount) {
      await client.query("rollback");
      return { error: "No se pudo asignar el asesor." };
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  await audit(user.id, "asesorar", "club_proposals", proposalId);
  refresh(proposalId);
  redirect(`/clubes/propuestas/${proposalId}`);
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
    if (!proposal || proposal.status !== "con_asesor" || !proposal.advisor_id) {
      await client.query("rollback");
      return { error: "La propuesta necesita un asesor antes de registrarse." };
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
    await pool.query(
      `update memberships set status = 'pendiente' where club_id = $1 and user_id = $2 and status = 'rechazada'`,
      [clubId, user.id],
    );
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
  if (user.id !== row.leader_id && user.id !== row.advisor_id) {
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
    `select c.active and (
       c.leader_id = $2 or c.advisor_id = $2 or exists (
         select 1 from memberships m where m.club_id = c.id and m.user_id = $2 and m.status = 'aceptada'
       )
     ) as can_post
     from clubs c where c.id = $1`,
    [clubId, user.id],
  );
  if (!access.rows[0]?.can_post) return { error: "Solo integrantes aceptados pueden publicar en el feed del club." };

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
