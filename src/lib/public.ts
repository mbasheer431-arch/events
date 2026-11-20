import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

/** Published webinar + everything the public page needs (service role; never exposes meeting links). */
export const getPublicWebinar = cache(async (slug: string) => {
  const db = createAdminClient();
  const { data: w } = await db.from("webinars")
    .select("id, organization_id, slug, title, short_description, description, cover_image_url, host_name, host_details, organizer_info, learning_outcomes, starts_at, duration_minutes, timezone, language, platform, capacity, registration_type, status")
    .eq("slug", slug).in("status", ["published", "completed"]).maybeSingle();
  if (!w) return null;
  const [{ data: org }, { data: speakers }, { data: form }, { data: questions }, { data: tickets }, { count }] = await Promise.all([
    db.from("organizations").select("name, logo_url, website").eq("id", w.organization_id).single(),
    db.from("webinar_speakers").select("name, title, bio, photo_url").eq("webinar_id", w.id).order("position"),
    db.from("registration_forms").select("fields, consent_text, submit_label, success_message").eq("webinar_id", w.id).maybeSingle(),
    db.from("registration_questions").select("id, label, type, options, required").eq("webinar_id", w.id).order("position"),
    db.from("tickets").select("id, name, description, price_minor, currency, quantity").eq("webinar_id", w.id).eq("is_active", true).order("position"),
    db.from("participants").select("id", { count: "exact", head: true }).eq("webinar_id", w.id).in("status", ["confirmed", "pending_payment", "pending_approval"]),
  ]);
  return { webinar: w, org, speakers: speakers || [], form, questions: questions || [], tickets: tickets || [], registeredCount: count || 0 };
});
