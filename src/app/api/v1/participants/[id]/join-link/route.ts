import { apiContext } from "@/lib/api-auth";
import { fail, json } from "@/lib/http";
import { APP_URL } from "@/lib/utils";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext();
  if (!ctx) return fail("unauthorized", 401);
  const { id } = await params;
  const { data } = await ctx.supabase.from("webinar_join_links").select("token, click_count, first_clicked_at, last_clicked_at").eq("participant_id", id).eq("organization_id", ctx.orgId).maybeSingle();
  return data ? json({ data: { ...data, url: `${APP_URL}/j/${data.token}` } }) : fail("not found", 404);
}
