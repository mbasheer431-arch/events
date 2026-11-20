import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/crypto";
import { sendEmail } from "@/lib/providers/resend";
import { watiSendTemplate, type WatiConfig } from "@/lib/providers/wati";
import { buildVariables, ctaFor, DEFAULT_EMAILS, emailHtml, render } from "@/lib/templates";
import { normalizePhone } from "@/lib/utils";

type Db = SupabaseClient;

export async function getWatiConfig(db: Db, orgId: string): Promise<WatiConfig | null> {
  const { data } = await db.from("wati_connections")
    .select("api_base_url, tenant_id, access_token_encrypted, channel_number, status")
    .eq("organization_id", orgId).maybeSingle();
  if (!data || data.status !== "connected") return null;
  try {
    return { baseUrl: data.api_base_url, tenantId: data.tenant_id, token: decrypt(data.access_token_encrypted), channelNumber: data.channel_number };
  } catch {
    return null;
  }
}

export type SendSpec = {
  orgId: string;
  participantId: string;
  workflowId?: string | null;
  campaignId?: string | null;
  defaultKey: string;                       // which DEFAULT_EMAILS / CTA to use
  sendWhatsapp: boolean;
  sendEmail: boolean;
  whatsappTemplateId?: string | null;
  emailTemplateId?: string | null;
};

export type SendResult = { whatsapp: "sent" | "failed" | "skipped"; email: "sent" | "failed" | "skipped"; errors: string[] };

/** Sends the WhatsApp and/or email message for one participant and writes message_logs. */
export async function sendToParticipant(db: Db, spec: SendSpec, cache?: { wati?: WatiConfig | null }): Promise<SendResult> {
  const result: SendResult = { whatsapp: "skipped", email: "skipped", errors: [] };

  const { data: p } = await db.from("participants")
    .select("id, full_name, email, phone, participant_code, consent_whatsapp, consent_email, webinar_id, webinars(id, slug, title, starts_at, duration_minutes, timezone, host_name, replay_url, feedback_url, next_step_url), webinar_join_links(token)")
    .eq("id", spec.participantId).eq("organization_id", spec.orgId).single();
  if (!p) return { ...result, errors: ["participant not found"] };
  const { data: org } = await db.from("organizations").select("name, email_from_name, email_reply_to").eq("id", spec.orgId).single();

  const webinar = p.webinars as any;
  const link = Array.isArray(p.webinar_join_links) ? p.webinar_join_links[0] : (p.webinar_join_links as any);
  const vars = buildVariables({ participant: p, webinar, orgName: org?.name || "EventOS", joinToken: link?.token });

  const templateIds = [spec.whatsappTemplateId, spec.emailTemplateId].filter(Boolean) as string[];
  const { data: tpls } = templateIds.length
    ? await db.from("message_templates").select("*").in("id", templateIds).eq("organization_id", spec.orgId)
    : { data: [] as any[] };
  const waTpl = tpls?.find((t) => t.id === spec.whatsappTemplateId && t.channel === "whatsapp");
  const emTpl = tpls?.find((t) => t.id === spec.emailTemplateId && t.channel === "email");

  // ---- WhatsApp via WATI ----
  const phone = normalizePhone(p.phone);
  if (spec.sendWhatsapp && waTpl?.wati_template_name && p.consent_whatsapp && phone) {
    let wati = cache?.wati;
    if (wati === undefined) {
      wati = await getWatiConfig(db, spec.orgId);
      if (cache) cache.wati = wati;
    }
    if (!wati) {
      result.whatsapp = "failed"; result.errors.push("WATI not connected");
    } else {
      const mapping = (waTpl.variable_mapping || []) as { param: string; variable: string; static?: string }[];
      const parameters = mapping.map((m) => ({ name: m.param, value: m.variable === "static" ? (m.static || "") : (vars as any)[m.variable] ?? "" }));
      const r = await watiSendTemplate(wati, {
        to: phone, templateName: waTpl.wati_template_name,
        broadcastName: `eventos_${spec.defaultKey}_${webinar.slug}`.slice(0, 60), parameters,
      });
      await db.from("message_logs").insert({
        organization_id: spec.orgId, webinar_id: webinar.id, participant_id: p.id, workflow_id: spec.workflowId || null,
        campaign_id: spec.campaignId || null, channel: "whatsapp", provider: "wati", recipient: phone,
        template_name: waTpl.wati_template_name,
        provider_message_id: r.ok ? r.localMessageId : null,
        // API success = accepted, not delivered. Webhooks move it to sent/delivered/read.
        status: r.ok ? "pending" : "failed", error: r.ok ? null : r.error,
      });
      result.whatsapp = r.ok ? "sent" : "failed";
      if (!r.ok) result.errors.push(`WhatsApp: ${r.error}`);
    }
  }

  // ---- Email via Resend ----
  if (spec.sendEmail && p.consent_email !== false && p.email) {
    const def = DEFAULT_EMAILS[spec.defaultKey] || DEFAULT_EMAILS.campaign;
    const subject = render(emTpl?.subject || def.subject, vars);
    const text = render(emTpl?.body || def.body, vars);
    const cta = ctaFor(spec.defaultKey, vars);
    const r = await sendEmail({
      to: p.email, subject, text,
      html: emailHtml(text, { orgName: org?.name || "EventOS", ctaUrl: cta?.url, ctaLabel: cta?.label }),
      fromName: org?.email_from_name || org?.name, replyTo: org?.email_reply_to,
    });
    await db.from("message_logs").insert({
      organization_id: spec.orgId, webinar_id: webinar.id, participant_id: p.id, workflow_id: spec.workflowId || null,
      campaign_id: spec.campaignId || null, channel: "email", provider: "resend", recipient: p.email,
      template_name: emTpl?.name || spec.defaultKey, subject,
      provider_message_id: r.ok ? r.id : null, status: r.ok ? "sent" : "failed", error: r.ok ? null : r.error,
      status_updated_at: new Date().toISOString(),
    });
    result.email = r.ok ? "sent" : "failed";
    if (!r.ok) result.errors.push(`Email: ${r.error}`);
  }

  // ---- roll up onto the participant record ----
  const anySent = result.whatsapp === "sent" || result.email === "sent";
  const anyFailed = result.whatsapp === "failed" || result.email === "failed";
  const patch: Record<string, string> = {};
  if (spec.defaultKey === "confirmation") patch.confirmation_status = anySent ? "sent" : anyFailed ? "failed" : "pending";
  if (spec.defaultKey.startsWith("reminder") || spec.defaultKey === "starting_15m") if (anySent) patch.reminder_status = "sent";
  if (["thank_you", "missed", "feedback", "campaign"].includes(spec.defaultKey) && anySent) patch.followup_status = "completed";
  if (Object.keys(patch).length) await db.from("participants").update(patch).eq("id", p.id);

  return result;
}
