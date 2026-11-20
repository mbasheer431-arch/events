import { apiContext } from "@/lib/api-auth";
import { fail, json } from "@/lib/http";

export async function GET() {
  const ctx = await apiContext();
  if (!ctx) return fail("unauthorized", 401);
  const { data } = await ctx.supabase.from("organization_members").select("role, organizations(id, name, slug, timezone)").eq("user_id", ctx.user.id);
  return json({ data, active: ctx.orgId });
}
