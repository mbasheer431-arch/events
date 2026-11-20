import { apiContext } from "@/lib/api-auth";
import { fail, json } from "@/lib/http";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext();
  if (!ctx) return fail("unauthorized", 401);
  const { id } = await params;
  const { data } = await ctx.supabase.from("webinars").select("*, webinar_speakers(*), tickets(*), registration_forms(*), registration_questions(*)").eq("id", id).eq("organization_id", ctx.orgId).maybeSingle();
  return data ? json({ data }) : fail("not found", 404);
}
