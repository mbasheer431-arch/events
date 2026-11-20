import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ORG_COOKIE } from "@/lib/org";

/** Session auth for organizer API routes. Returns null when not signed in or not a member. */
export async function apiContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: ms } = await supabase.from("organization_members").select("organization_id").eq("user_id", user.id);
  if (!ms?.length) return null;
  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const orgId = ms.find((m) => m.organization_id === wanted)?.organization_id || ms[0].organization_id;
  return { supabase, user, orgId };
}
