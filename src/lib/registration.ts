import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { runImmediateWorkflows, scheduleJobsForParticipant } from "@/lib/automation";
import { pushCrmEvent } from "@/lib/providers/crm";
import { participantCode, webinarEnd, type Attribution } from "@/lib/utils";

type Db = SupabaseClient;

export const registrationSchema = z.object({
  full_name: z.string().trim().min(2, "Please enter your full name").max(120),
  email: z.string().trim().toLowerCase().email("Please enter a valid email"),
  phone: z.string().trim().max(25).optional().nullable(),
  company: z.string().trim().max(120).optional().nullable(),
  designation: z.string().trim().max(120).optional().nullable(),
  location: z.string().trim().max(120).optional().nullable(),
  ticket_id: z.string().uuid().optional().nullable(),
  invite_code: z.string().trim().max(60).optional().nullable(),
  consent: z.boolean().optional(),
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
  attribution: z.object({
    source: z.string().max(40).optional(), utm_source: z.string().max(120).nullish(), utm_medium: z.string().max(120).nullish(),
    utm_campaign: z.string().max(200).nullish(), utm_content: z.string().max(200).nullish(), utm_term: z.string().max(200).nullish(),
    referrer: z.string().max(500).nullish(),
  }).optional(),
  visitor_id: z.string().max(64).optional(),
});
export type RegistrationInput = z.infer<typeof registrationSchema>;

export class RegistrationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const ACTIVE = ["confirmed", "pending_payment", "pending_approval"];

export async function createRegistration(db: Db, webinarIdOrSlug: string, input: RegistrationInput) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(webinarIdOrSlug);
  const { data: w } = await db.from("webinars").select("*").eq(isUuid ? "id" : "slug", webinarIdOrSlug).maybeSingle();
  if (!w || w.status !== "published") throw new RegistrationError("This webinar isn't open for registration.", 404);
  if (webinarEnd(w).getTime() < Date.now()) throw new RegistrationError("This webinar has already ended.");
  if (w.registration_type === "invite_only" && (!w.invite_code || input.invite_code !== w.invite_code)) {
    throw new RegistrationError("This webinar is invite-only. Please use the link from your invitation.", 403);
  }

  const [{ data: form }, { data: questions }, { data: tickets }] = await Promise.all([
    db.from("registration_forms").select("*").eq("webinar_id", w.id).maybeSingle(),
    db.from("registration_questions").select("*").eq("webinar_id", w.id).order("position"),
    db.from("tickets").select("*").eq("webinar_id", w.id).eq("is_active", true).order("position"),
  ]);

  // ---- validate configured standard fields & custom questions ----
  const fields = (form?.fields || {}) as Record<string, { enabled: boolean; required: boolean }>;
  for (const key of ["phone", "company", "designation", "location"] as const) {
    const f = fields[key];
    if (f?.enabled && f.required && !input[key]) throw new RegistrationError(`Please fill in ${key === "phone" ? "your WhatsApp number" : key}.`);
  }
  if (input.phone && input.phone.replace(/\D/g, "").length < 8) throw new RegistrationError("Please enter a valid WhatsApp number with country code.");
  const answers = input.answers || {};
  for (const q of questions || []) {
    const a = answers[q.id];
    const empty = a === undefined || (Array.isArray(a) ? a.length === 0 : String(a).trim() === "");
    if (q.required && empty) throw new RegistrationError(`Please answer: ${q.label}`);
  }

  // ---- ticket selection ----
  let ticket: any = null;
  if (tickets?.length) {
    ticket = tickets.find((t) => t.id === input.ticket_id) || (tickets.length === 1 ? tickets[0] : null);
    if (!ticket) throw new RegistrationError("Please choose a ticket.");
  }
  const isPaid = !!ticket && ticket.price_minor > 0;

  // ---- duplicate registration: idempotent ----
  const { data: existing } = await db.from("participants")
    .select("id, participant_code, status, payment_status").eq("webinar_id", w.id).eq("email", input.email).maybeSingle();
  if (existing && existing.status !== "cancelled" && existing.status !== "rejected") {
    if (existing.status === "pending_payment" && isPaid) return { webinar: w, participant: existing, ticket, isPaid, duplicate: true };
    return { webinar: w, participant: existing, ticket, isPaid: false, duplicate: true };
  }

  // ---- capacity ----
  if (w.capacity) {
    const { count } = await db.from("participants").select("id", { count: "exact", head: true }).eq("webinar_id", w.id).in("status", ACTIVE);
    if ((count || 0) >= w.capacity) throw new RegistrationError("Sorry, this webinar is full.", 409);
  }
  if (ticket?.quantity) {
    const { count } = await db.from("participants").select("id", { count: "exact", head: true }).eq("ticket_id", ticket.id).in("status", ACTIVE);
    if ((count || 0) >= ticket.quantity) throw new RegistrationError(`"${ticket.name}" is sold out.`, 409);
  }

  const status = isPaid ? "pending_payment" : w.registration_type === "approval" ? "pending_approval" : "confirmed";
  const attr: Attribution = { source: "direct", ...(input.attribution || {}) } as Attribution;
  const row = {
    organization_id: w.organization_id, webinar_id: w.id, participant_code: participantCode(),
    full_name: input.full_name, email: input.email, phone: input.phone || null,
    company: input.company || null, designation: input.designation || null, location: input.location || null,
    ticket_id: ticket?.id || null, status, payment_status: isPaid ? "pending" : "not_required",
    source: attr.source || "direct", utm_source: attr.utm_source || null, utm_medium: attr.utm_medium || null,
    utm_campaign: attr.utm_campaign || null, utm_content: attr.utm_content || null, utm_term: attr.utm_term || null,
    referrer: attr.referrer || null, consent_whatsapp: !!input.consent && !!input.phone, consent_email: true,
    confirmed_at: status === "confirmed" ? new Date().toISOString() : null,
  };

  let participant: any;
  if (existing) {
    const { data, error } = await db.from("participants").update(row).eq("id", existing.id).select().single();
    if (error) throw new RegistrationError("Could not save your registration. Please try again.", 500);
    participant = data;
    await db.from("participant_answers").delete().eq("participant_id", existing.id);
  } else {
    const { data, error } = await db.from("participants").insert(row).select().single();
    if (error) {
      if (error.code === "23505") throw new RegistrationError("You're already registered with this email.", 409);
      throw new RegistrationError("Could not save your registration. Please try again.", 500);
    }
    participant = data;
  }

  const answerRows = (questions || []).filter((q) => answers[q.id] !== undefined).map((q) => ({
    organization_id: w.organization_id, participant_id: participant.id, question_id: q.id, question_label: q.label,
    answer: Array.isArray(answers[q.id]) ? (answers[q.id] as string[]).join(", ") : String(answers[q.id]),
  }));
  await Promise.all([
    answerRows.length ? db.from("participant_answers").insert(answerRows) : null,
    db.from("webinar_join_links").upsert({ organization_id: w.organization_id, webinar_id: w.id, participant_id: participant.id }, { onConflict: "participant_id", ignoreDuplicates: true }),
    db.from("analytics_events").insert({
      organization_id: w.organization_id, webinar_id: w.id, event_type: "registration", visitor_id: input.visitor_id || null,
      source: row.source, utm_source: row.utm_source, utm_medium: row.utm_medium, utm_campaign: row.utm_campaign, referrer: row.referrer,
    }),
  ]);

  return { webinar: w, participant, ticket, isPaid, duplicate: false };
}

/** Everything that happens once a registration is confirmed (free, approved or paid). */
export async function onParticipantConfirmed(db: Db, participantId: string) {
  const { data: p } = await db.from("participants")
    .select("id, organization_id, webinar_id, participant_code, full_name, email, phone, company, designation, location, source, utm_source, utm_campaign, webinars(id, title, slug, starts_at, duration_minutes)")
    .eq("id", participantId).single();
  if (!p) return;
  const w = p.webinars as any;
  await db.from("webinar_join_links").upsert({ organization_id: p.organization_id, webinar_id: w.id, participant_id: p.id }, { onConflict: "participant_id", ignoreDuplicates: true });
  await runImmediateWorkflows(db, p.organization_id, p.id, w.id);
  await scheduleJobsForParticipant(db, p.organization_id, p.id, w);
  await pushCrmEvent(p.organization_id, "participant.confirmed", {
    participant_id: p.participant_code, name: p.full_name, email: p.email, phone: p.phone, company: p.company,
    designation: p.designation, location: p.location, source: p.source, utm_source: p.utm_source, utm_campaign: p.utm_campaign,
    webinar: { id: w.id, title: w.title, slug: w.slug, starts_at: w.starts_at },
  });
}

export async function confirmParticipant(db: Db, participantId: string, extra: Record<string, unknown> = {}) {
  const { data } = await db.from("participants")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString(), ...extra })
    .eq("id", participantId).neq("status", "confirmed").select("id").maybeSingle();
  if (data) await onParticipantConfirmed(db, participantId); // only once
  return !!data;
}
