import type { SupabaseClient } from "@supabase/supabase-js";

export const PARTICIPANT_COLUMNS =
  "id, webinar_id, participant_code, full_name, email, phone, company, designation, location, source, utm_source, utm_medium, utm_campaign, status, payment_status, confirmation_status, reminder_status, followup_status, join_link_clicked, first_clicked_at, attended, join_time, leave_time, attended_minutes, consent_whatsapp, created_at, webinars(title), tickets(name, price_minor)";

/** Shared filtering for participant lists and CSV export. */
export function participantQuery(db: SupabaseClient, orgId: string, sp: Record<string, string | undefined>, webinarId?: string) {
  let q = db.from("participants").select(PARTICIPANT_COLUMNS, { count: "exact" }).eq("organization_id", orgId);
  if (webinarId) q = q.eq("webinar_id", webinarId);
  if (sp.webinar) q = q.eq("webinar_id", sp.webinar);
  if (sp.status) q = q.eq("status", sp.status);
  if (sp.source) q = q.eq("source", sp.source);
  if (sp.segment === "attended") q = q.eq("attended", true);
  if (sp.segment === "absent") q = q.eq("attended", false).eq("status", "confirmed");
  if (sp.segment === "clicked_not_attended") q = q.eq("join_link_clicked", true).eq("attended", false);
  if (sp.segment === "not_clicked") q = q.eq("join_link_clicked", false);
  if (sp.q) {
    const term = sp.q.replace(/[%,()]/g, " ").trim();
    if (term) q = q.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,participant_code.ilike.%${term}%`);
  }
  return q.order("created_at", { ascending: false });
}
