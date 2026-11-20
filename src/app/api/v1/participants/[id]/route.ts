import { apiContext } from "@/lib/api-auth";
import { fail, json } from "@/lib/http";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext();
  if (!ctx) return fail("unauthorized", 401);
  const { id } = await params;
  const { data } = await ctx.supabase.from("participants")
    .select("*, participant_answers(question_label, answer), attendance_records(provider, join_time, leave_time, duration_seconds), message_logs(channel, template_name, status, created_at)")
    .eq("id", id).eq("organization_id", ctx.orgId).maybeSingle();
  return data ? json({ data }) : fail("not found", 404);
}
