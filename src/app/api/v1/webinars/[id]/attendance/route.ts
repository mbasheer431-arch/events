import { apiContext } from "@/lib/api-auth";
import { fail, json } from "@/lib/http";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext();
  if (!ctx) return fail("unauthorized", 401);
  const { id } = await params;
  const { data } = await ctx.supabase.from("attendance_records").select("id, participant_id, provider, name, email, join_time, leave_time, duration_seconds, created_at")
    .eq("webinar_id", id).eq("organization_id", ctx.orgId).order("join_time");
  return json({ data });
}
