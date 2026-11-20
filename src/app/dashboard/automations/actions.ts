"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchesSegment, processDueJobs, rescheduleWebinar } from "@/lib/automation";
import { sendToParticipant } from "@/lib/messaging";
import type { WatiConfig } from "@/lib/providers/wati";

const s = (f: FormData, k: string) => { const v = f.get(k); return v === null ? null : String(v).trim() || null; };
const back = (path: string, msg: string, kind: "ok" | "error" = "ok") => redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);

export async function updateWorkflow(formData: FormData) {
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const id = s(formData, "id")!;
  const webinarId = s(formData, "webinar_id")!;
  const trigger = s(formData, "trigger");
  const patch: Record<string, unknown> = {
    enabled: formData.get("enabled") === "on",
    send_whatsapp: formData.get("send_whatsapp") === "on",
    send_email: formData.get("send_email") === "on",
    whatsapp_template_id: s(formData, "whatsapp_template_id"),
    email_template_id: s(formData, "email_template_id"),
  };
  if (trigger !== "registration_confirmed") {
    const offset = Number(s(formData, "offset_value") || 0) * Number(s(formData, "offset_unit") || 1);
    patch.offset_minutes = Math.max(0, Math.round(offset));
    if (s(formData, "segment")) patch.segment = s(formData, "segment");
  }
  await supabase.from("automation_workflows").update(patch).eq("id", id).eq("organization_id", ctx.org.id);
  await rescheduleWebinar(supabase, ctx.org.id, webinarId);
  revalidatePath(`/dashboard/webinars/${webinarId}/automations`);
  back(`/dashboard/webinars/${webinarId}/automations`, "Automation saved and queue rebuilt");
}

export async function saveEmailTemplate(formData: FormData) {
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const row = { organization_id: ctx.org.id, channel: "email", name: s(formData, "name")!, subject: s(formData, "subject"), body: s(formData, "body") };
  const id = s(formData, "id");
  if (id) await supabase.from("message_templates").update(row).eq("id", id);
  else await supabase.from("message_templates").insert(row);
  revalidatePath("/dashboard/automations");
  back("/dashboard/automations", "Email template saved");
}

export async function deleteTemplate(formData: FormData) {
  const supabase = await createClient();
  await supabase.from("message_templates").delete().eq("id", s(formData, "id")!);
  const to = s(formData, "back") || "/dashboard/automations";
  revalidatePath(to);
  back(to, "Template deleted");
}

/** Manually run the queue now (handy before cron is configured). */
export async function runQueueNow() {
  await getOrgContext();
  const stats = await processDueJobs(createAdminClient(), 200);
  revalidatePath("/dashboard/automations");
  back("/dashboard/automations", `Queue processed: ${stats.done} sent, ${stats.skipped} skipped, ${stats.failed} failed.`);
}

// ---------- One-off follow-up campaigns ----------
export async function sendCampaign(formData: FormData) {
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const webinarId = s(formData, "webinar_id")!;
  const path = `/dashboard/webinars/${webinarId}/messages`;
  const segment = s(formData, "segment") || "all";
  const sendWa = formData.get("send_whatsapp") === "on";
  const sendEm = formData.get("send_email") === "on";
  if (!sendWa && !sendEm) return back(path, "Choose WhatsApp and/or email", "error");

  const { data: campaign, error } = await supabase.from("campaigns").insert({
    organization_id: ctx.org.id, webinar_id: webinarId, name: s(formData, "name") || "Follow-up", segment,
    send_whatsapp: sendWa, send_email: sendEm, whatsapp_template_id: s(formData, "whatsapp_template_id"),
    email_template_id: s(formData, "email_template_id"), status: "sending", created_by: ctx.user.id,
  }).select().single();
  if (error || !campaign) return back(path, error?.message || "Could not create campaign", "error");

  const { data: people } = await supabase.from("participants").select("id, attended, join_link_clicked")
    .eq("webinar_id", webinarId).eq("status", "confirmed").limit(5000);
  const targets = (people || []).filter((p) => matchesSegment(segment, p));
  const admin = createAdminClient();
  const cache: { wati?: WatiConfig | null } = {};
  let sent = 0;
  // small concurrency pool to stay within provider rate limits
  const queue = [...targets];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      const r = await sendToParticipant(admin, {
        orgId: ctx.org.id, participantId: p.id, campaignId: campaign.id, defaultKey: "campaign",
        sendWhatsapp: sendWa, sendEmail: sendEm, whatsappTemplateId: campaign.whatsapp_template_id, emailTemplateId: campaign.email_template_id,
      }, cache);
      if (r.whatsapp === "sent" || r.email === "sent") sent++;
    }
  }));
  await supabase.from("campaigns").update({ status: "sent", recipients_count: targets.length, sent_at: new Date().toISOString() }).eq("id", campaign.id);
  revalidatePath(path);
  back(path, `Campaign sent to ${sent} of ${targets.length} participants.`);
}
