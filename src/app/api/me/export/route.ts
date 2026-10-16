import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const badges = await pool.query("select code, label, awarded_at from badges where user_id = $1", [user.id]);
  const prefs = await pool.query("select * from notification_prefs where user_id = $1", [user.id]);
  return NextResponse.json({ user, badges: badges.rows, prefs: prefs.rows[0] ?? null });
}
