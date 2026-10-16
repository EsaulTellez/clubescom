"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";

type FormState = { error?: string; ok?: string };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function markRead(form: FormData) {
  const user = await getSession();
  if (!user) redirect("/entrar");
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return;
  await pool.query(
    `update notifications set read = true where id = $1 and user_id = $2 and read = false`,
    [id, user.id],
  );
  revalidatePath("/notificaciones");
}

export async function markAllRead() {
  const user = await getSession();
  if (!user) redirect("/entrar");
  await pool.query(
    `update notifications set read = true where user_id = $1 and read = false`,
    [user.id],
  );
  revalidatePath("/notificaciones");
}

export async function savePrefs(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSession();
  if (!user) redirect("/entrar");
  await pool.query(
    `insert into notification_prefs (user_id, email_clubs, email_forum, email_lost)
     values ($1, $2, $3, $4)
     on conflict (user_id) do update set
       email_clubs = excluded.email_clubs,
       email_forum = excluded.email_forum,
       email_lost = excluded.email_lost`,
    [
      user.id,
      form.get("email_clubs") === "on",
      form.get("email_forum") === "on",
      form.get("email_lost") === "on",
    ],
  );
  revalidatePath("/notificaciones");
  return { ok: "Preferencias guardadas." };
}
