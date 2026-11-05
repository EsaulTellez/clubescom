"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { pool } from "@/lib/db";
import { getAppealIdentity } from "./auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function submitAppeal(form: FormData) {
  const identity = await getAppealIdentity();
  if (!identity) redirect("/entrar");
  const suspensionId = String(form.get("suspension_id") ?? "");
  const body = String(form.get("body") ?? "").trim();
  if (!UUID.test(suspensionId) || body.length < 20 || body.length > 3000) redirect("/apelaciones?error=datos");

  try {
    await pool.query(
      `insert into moderation_appeals (suspension_id, user_id, body)
       select id, user_id, $3 from moderation_suspensions
        where id = $1 and user_id = $2`,
      [suspensionId, identity.id, body],
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "23505") redirect("/apelaciones?error=pendiente");
    redirect("/apelaciones?error=guardar");
  }
  revalidatePath("/apelaciones");
  revalidatePath("/moderacion");
  redirect("/apelaciones?enviada=1");
}
