import { apiContext } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchesSegment } from "@/lib/automation";
import { fail, json } from "@/lib/http";
import { sendToParticipant } from "@/lib/messaging";

/** Run a workflow right now for every confirmed participant in its segment (manual trigger). */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext();
  if (!ctx) return fail("unauthorized", 401);
  const { id } = await params;
  const { data: wf } = await ctx.supabase.from("automation_workflows").select("*").eq("id", id).eq("organization_id", ctx.orgId).maybeSingle();
  if (!wf) return fail("not found", 404);
  const { data: ps } = await ctx.supabase.from("participants").select("id, attended, join_link_clicked").eq("webinar_id", wf.webinar_id).eq("status", "confirmed").limit(5000);
  const admin = createAdminClient();
  const cache = {};
  let sent = 0;
  for (const p of (ps || []).filter((x) => matchesSegment(wf.segment, x))) {
    const r = await sendToParticipant(admin, { orgId: ctx.orgId, participantId: p.id, workflowId: wf.id, defaultKey: wf.key, sendWhatsapp: wf.send_whatsapp, sendEmail: wf.send_email, whatsappTemplateId: wf.whatsapp_template_id, emailTemplateId: wf.email_template_id }, cache);
    if (r.whatsapp === "sent" || r.email === "sent") sent++;
  }
  return json({ ok: true, sent });
}
