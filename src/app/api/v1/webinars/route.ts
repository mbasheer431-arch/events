import { apiContext } from "@/lib/api-auth";
import { fail, json } from "@/lib/http";

export async function GET() {
  const ctx = await apiContext();
  if (!ctx) return fail("unauthorized", 401);
  const { data } = await ctx.supabase.from("webinars").select("id, slug, title, status, starts_at, duration_minutes, timezone, platform, registration_type, capacity").eq("organization_id", ctx.orgId).order("starts_at", { ascending: false });
  return json({ data });
}
