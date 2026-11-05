import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getAppealIdentity() {
  const supabase = await createSupabaseServerClient();
  const [{ data: claims, error: claimsError }, { data: userData, error: userError }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.auth.getUser(),
  ]);
  const id = claims?.claims?.sub;
  const user = userData.user;
  if (claimsError || userError || typeof id !== "string" || !user || user.id !== id) return null;

  const { data: profile, error } = await supabase
    .from("users")
    .select("id, name, is_active")
    .eq("id", id)
    .maybeSingle();
  if (error || !profile?.is_active) return null;
  return { id: profile.id, name: profile.name };
}
