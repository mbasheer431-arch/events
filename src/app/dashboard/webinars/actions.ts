"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rescheduleWebinar, seedDefaultWorkflows } from "@/lib/automation";
import { confirmParticipant } from "@/lib/registration";
import { sendToParticipant } from "@/lib/messaging";
import { importAttendanceCsv, markAttendanceManually } from "@/lib/attendance";
import { zoomMeetingIdFromUrl } from "@/lib/providers/zoom";
import { localToUtcIso, parseCsv, randomCode, slugify } from "@/lib/utils";

const s = (f: FormData, k: string) => { const v = f.get(k); return v === null ? null : String(v).trim() || null; };
const n = (f: FormData, k: string) => { const v = s(f, k); return v === null ? null : Number(v); };
const back = (path: string, msg: string, kind: "ok" | "error" = "ok") => redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);

async function uniqueSlug(base: string, excludeId?: string) {
  const admin = createAdminClient();
  let slug = slugify(base) || `webinar-${randomCode(5).toLowerCase()}`;
  for (let i = 0; i < 5; i++) {
    const { data } = await admin.from("webinars").select("id").eq("slug", slug).maybeSingle();
    if (!data || data.id === excludeId) return slug;
    slug = `${slugify(base)}-${randomCode(4).toLowerCase()}`;
  }
  return `${slug}-${Date.now().toString(36)}`;
}

async function uploadImage(orgId: string, file: File | null, folder: string) {
  if (!file || !file.size) return null;
  if (!file.type.startsWith("image/")) throw new Error("Cover must be an image");
  if (file.size > 4 * 1024 * 1024) throw new Error("Image must be under 4 MB");
  const supabase = await createClient();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${orgId}/${folder}/${Date.now()}-${randomCode(6)}.${ext}`;
  const { error } = await supabase.storage.from("webinar-assets").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return supabase.storage.from("webinar-assets").getPublicUrl(path).data.publicUrl;
}

function webinarPayload(f: FormData) {
  const tz = s(f, "timezone") || "Asia/Kolkata";
  const local = s(f, "starts_at_local");
  if (!local) throw new Error("Date and time are required");
  const meetingUrl = s(f, "meeting_url");
  const platform = (s(f, "platform") || "zoom") as string;
  return {
    title: s(f, "title")!,
    short_description: s(f, "short_description"),
    description: s(f, "description"),
    host_name: s(f, "host_name"),
    host_details: s(f, "host_details"),
    organizer_info: s(f, "organizer_info"),
    learning_outcomes: (s(f, "learning_outcomes") || "").split("\n").map((x) => x.trim()).filter(Boolean),
    starts_at: localToUtcIso(local, tz),
    duration_minutes: n(f, "duration_minutes") || 60,
    timezone: tz,
    language: s(f, "language") || "English",
    platform,
    meeting_url: meetingUrl,
    meeting_id: s(f, "meeting_id") || (platform === "zoom" ? zoomMeetingIdFromUrl(meetingUrl) : null),
    meeting_passcode: s(f, "meeting_passcode"),
    capacity: n(f, "capacity"),
    registration_type: (s(f, "registration_type") || "free") as string,
    invite_code: s(f, "invite_code"),
  };
}

export async function createWebinar(formData: FormData) {
  const ctx = await getOrgContext();
  const supabase = await createClient();
  let id: string;
  try {
    const p = webinarPayload(formData);
    if (!p.title) throw new Error("Title is required");
    if (p.registration_type === "invite_only" && !p.invite_code) p.invite_code = randomCode(8);
    const cover = await uploadImage(ctx.org.id, formData.get("cover_image") as File | null, "covers");
    const slug = await uniqueSlug(s(formData, "slug") || p.title);
    const { data: w, error } = await supabase.from("webinars")
      .insert({ ...p, slug, cover_image_url: cover, organization_id: ctx.org.id, created_by: ctx.user.id }).select("id").single();
    if (error) throw new Error(error.message);
    id = w.id;

    const speakers = JSON.parse(s(formData, "speakers_json") || "[]") as { name: string; title?: string; bio?: string; photo_url?: string }[];
    const rows = speakers.filter((x) => x.name?.trim()).map((x, i) => ({ organization_id: ctx.org.id, webinar_id: id, name: x.name.trim(), title: x.title || null, bio: x.bio || null, photo_url: x.photo_url || null, position: i }));
    if (rows.length) await supabase.from("webinar_speakers").insert(rows);

    await supabase.from("registration_forms").insert({
      organization_id: ctx.org.id, webinar_id: id,
      fields: {
        phone: { enabled: true, required: formData.get("phone_required") === "on" },
        company: { enabled: formData.get("ask_company") === "on", required: false },
        designation: { enabled: formData.get("ask_designation") === "on", required: false },
        location: { enabled: formData.get("ask_location") === "on", required: false },
      },
    });
    if (p.registration_type === "paid") {
      const price = Math.round((n(formData, "ticket_price") || 0) * 100);
      await supabase.from("tickets").insert({ organization_id: ctx.org.id, webinar_id: id, name: s(formData, "ticket_name") || "General admission", price_minor: price, currency: s(formData, "currency") || "INR" });
    }
    await seedDefaultWorkflows(supabase, ctx.org.id, id);
  } catch (e: any) {
    return back("/dashboard/webinars/new", e.message || "Could not create webinar", "error");
  }
  redirect(`/dashboard/webinars/${id}?ok=${encodeURIComponent("Webinar created as a draft. Review it, then publish.")}`);
}

export async function updateWebinar(formData: FormData) {
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const id = s(formData, "id")!;
  const path = `/dashboard/webinars/${id}/settings`;
  try {
    const { data: before } = await supabase.from("webinars").select("starts_at, duration_minutes").eq("id", id).single();
    const p = webinarPayload(formData);
    const cover = await uploadImage(ctx.org.id, formData.get("cover_image") as File | null, "covers");
    const slugIn = s(formData, "slug");
    const patch: Record<string, unknown> = {
      ...p, replay_url: s(formData, "replay_url"), feedback_url: s(formData, "feedback_url"), next_step_url: s(formData, "next_step_url"),
      ...(cover ? { cover_image_url: cover } : {}),
      ...(slugIn ? { slug: await uniqueSlug(slugIn, id) } : {}),
    };
    if (p.registration_type === "invite_only" && !p.invite_code) patch.invite_code = randomCode(8);
    const { error } = await supabase.from("webinars").update(patch).eq("id", id).eq("organization_id", ctx.org.id);
    if (error) throw new Error(error.message);
    if (before && (before.starts_at !== p.starts_at || before.duration_minutes !== p.duration_minutes)) {
      await rescheduleWebinar(supabase, ctx.org.id, id);
    }
  } catch (e: any) {
    return back(path, e.message || "Could not save", "error");
  }
  revalidatePath(`/dashboard/webinars/${id}`, "layout");
  back(path, "Saved. Reminders were rescheduled if the time changed.");
}

export async function setWebinarStatus(formData: FormData) {
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const id = s(formData, "id")!;
  const status = s(formData, "status")!;
  const { data: w } = await supabase.from("webinars").select("meeting_url, registration_type, title").eq("id", id).single();
  if (status === "published") {
    if (!w?.meeting_url) return back(`/dashboard/webinars/${id}`, "Add the meeting / streaming link in Settings before publishing.", "error");
    if (w.registration_type === "paid") {
      const { data: rp } = await supabase.from("integrations").select("enabled").eq("organization_id", ctx.org.id).eq("provider", "razorpay").maybeSingle();
      if (!rp?.enabled) return back(`/dashboard/webinars/${id}`, "Connect Razorpay in Settings → Integrations before publishing a paid webinar.", "error");
    }
  }
  await supabase.from("webinars").update({ status, ...(status === "published" ? { published_at: new Date().toISOString() } : {}) }).eq("id", id).eq("organization_id", ctx.org.id);
  if (status === "cancelled") await rescheduleWebinar(supabase, ctx.org.id, id);
  revalidatePath(`/dashboard/webinars/${id}`, "layout");
  back(`/dashboard/webinars/${id}`, status === "published" ? "Published! Your registration page is live." : `Webinar marked ${status}.`);
}

export async function deleteWebinar(formData: FormData) {
  const ctx = await getOrgContext();
  const supabase = await createClient();
  await supabase.from("webinars").delete().eq("id", s(formData, "id")!).eq("organization_id", ctx.org.id);
  redirect("/dashboard/webinars?ok=Webinar+deleted");
}

export async function duplicateWebinar(formData: FormData) {
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const id = s(formData, "id")!;
  const { data: w } = await supabase.from("webinars").select("*").eq("id", id).single();
  if (!w) return;
  const { id: _i, created_at, updated_at, published_at, slug, ...rest } = w;
  const { data: copy } = await supabase.from("webinars").insert({ ...rest, title: `${w.title} (copy)`, slug: await uniqueSlug(`${w.slug}-copy`), status: "draft", created_by: ctx.user.id }).select("id").single();
  if (!copy) return;
  const [{ data: sp }, { data: form }, { data: qs }, { data: tk }] = await Promise.all([
    supabase.from("webinar_speakers").select("*").eq("webinar_id", id),
    supabase.from("registration_forms").select("*").eq("webinar_id", id).maybeSingle(),
    supabase.from("registration_questions").select("*").eq("webinar_id", id),
    supabase.from("tickets").select("*").eq("webinar_id", id),
  ]);
  const strip = (r: any) => { const { id: _x, created_at: _c, updated_at: _u, ...o } = r; return { ...o, webinar_id: copy.id }; };
  if (sp?.length) await supabase.from("webinar_speakers").insert(sp.map(strip));
  if (form) await supabase.from("registration_forms").insert(strip(form));
  if (qs?.length) await supabase.from("registration_questions").insert(qs.map(strip));
  if (tk?.length) await supabase.from("tickets").insert(tk.map(strip));
  await seedDefaultWorkflows(supabase, ctx.org.id, copy.id);
  redirect(`/dashboard/webinars/${copy.id}/settings?ok=Duplicated.+Update+the+date+and+link.`);
}

// ---------- Speakers ----------
export async function addSpeaker(formData: FormData) {
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const webinarId = s(formData, "webinar_id")!;
  const path = `/dashboard/webinars/${webinarId}/settings`;
  try {
    const photo = await uploadImage(ctx.org.id, formData.get("photo") as File | null, "speakers");
    await supabase.from("webinar_speakers").insert({
      organization_id: ctx.org.id, webinar_id: webinarId, name: s(formData, "name")!, title: s(formData, "title"),
      bio: s(formData, "bio"), photo_url: photo || s(formData, "photo_url"), position: n(formData, "position") || 0,
    });
  } catch (e: any) { return back(path, e.message, "error"); }
  revalidatePath(path);
}
export async function deleteSpeaker(formData: FormData) {
  const supabase = await createClient();
  await supabase.from("webinar_speakers").delete().eq("id", s(formData, "id")!);
  revalidatePath(`/dashboard/webinars/${s(formData, "webinar_id")}/settings`);
}

// ---------- Registration form & tickets ----------
export async function saveRegistrationForm(formData: FormData) {
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const webinarId = s(formData, "webinar_id")!;
  const fields: Record<string, { enabled: boolean; required: boolean }> = {};
  for (const k of ["phone", "company", "designation", "location"]) {
    fields[k] = { enabled: formData.get(`${k}_enabled`) === "on", required: formData.get(`${k}_required`) === "on" };
  }
  await supabase.from("registration_forms").upsert({
    organization_id: ctx.org.id, webinar_id: webinarId, fields,
    consent_text: s(formData, "consent_text") || "I agree to receive webinar updates on WhatsApp and email.",
    submit_label: s(formData, "submit_label") || "Register Now",
    success_message: s(formData, "success_message") || "You're registered!",
  }, { onConflict: "webinar_id" });
  revalidatePath(`/dashboard/webinars/${webinarId}/registration`);
  back(`/dashboard/webinars/${webinarId}/registration`, "Registration form saved");
}

export async function addQuestion(formData: FormData) {
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const webinarId = s(formData, "webinar_id")!;
  const { count } = await supabase.from("registration_questions").select("id", { count: "exact", head: true }).eq("webinar_id", webinarId);
  await supabase.from("registration_questions").insert({
    organization_id: ctx.org.id, webinar_id: webinarId, label: s(formData, "label")!, type: s(formData, "type") || "text",
    options: (s(formData, "options") || "").split(/\n|,/).map((x) => x.trim()).filter(Boolean),
    required: formData.get("required") === "on", position: count || 0,
  });
  revalidatePath(`/dashboard/webinars/${webinarId}/registration`);
}
export async function deleteQuestion(formData: FormData) {
  const supabase = await createClient();
  await supabase.from("registration_questions").delete().eq("id", s(formData, "id")!);
  revalidatePath(`/dashboard/webinars/${s(formData, "webinar_id")}/registration`);
}
export async function moveQuestion(formData: FormData) {
  const supabase = await createClient();
  const webinarId = s(formData, "webinar_id")!;
  const { data: qs } = await supabase.from("registration_questions").select("id, position").eq("webinar_id", webinarId).order("position");
  const list = qs || [];
  const i = list.findIndex((q) => q.id === s(formData, "id"));
  const j = s(formData, "dir") === "up" ? i - 1 : i + 1;
  if (i >= 0 && j >= 0 && j < list.length) {
    [list[i], list[j]] = [list[j], list[i]];
    await Promise.all(list.map((q, idx) => supabase.from("registration_questions").update({ position: idx }).eq("id", q.id)));
  }
  revalidatePath(`/dashboard/webinars/${webinarId}/registration`);
}

export async function saveTicket(formData: FormData) {
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const webinarId = s(formData, "webinar_id")!;
  const row = {
    organization_id: ctx.org.id, webinar_id: webinarId, name: s(formData, "name") || "General admission",
    description: s(formData, "description"), price_minor: Math.round((n(formData, "price") || 0) * 100),
    currency: s(formData, "currency") || "INR", quantity: n(formData, "quantity"), is_active: formData.get("is_active") !== "off",
  };
  const id = s(formData, "id");
  if (id) await supabase.from("tickets").update(row).eq("id", id);
  else await supabase.from("tickets").insert(row);
  revalidatePath(`/dashboard/webinars/${webinarId}/registration`);
}
export async function toggleTicket(formData: FormData) {
  const supabase = await createClient();
  await supabase.from("tickets").update({ is_active: s(formData, "active") === "true" }).eq("id", s(formData, "id")!);
  revalidatePath(`/dashboard/webinars/${s(formData, "webinar_id")}/registration`);
}

// ---------- Participants ----------
export async function participantAction(formData: FormData) {
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const id = s(formData, "id")!;
  const webinarId = s(formData, "webinar_id")!;
  const action = s(formData, "action");
  const path = `/dashboard/webinars/${webinarId}/participants`;
  // service-role client for side effects that write message logs/jobs consistently
  const admin = createAdminClient();
  const { data: p } = await supabase.from("participants").select("id, status, organization_id").eq("id", id).single();
  if (!p || p.organization_id !== ctx.org.id) return back(path, "Participant not found", "error");

  switch (action) {
    case "approve":
      await confirmParticipant(admin, id);
      break;
    case "reject":
      await supabase.from("participants").update({ status: "rejected" }).eq("id", id);
      break;
    case "cancel":
      await supabase.from("participants").update({ status: "cancelled" }).eq("id", id);
      await supabase.from("automation_jobs").update({ status: "cancelled" }).eq("participant_id", id).eq("status", "pending");
      break;
    case "attended":
      await markAttendanceManually(supabase, ctx.org.id, webinarId, id, true); break;
    case "not_attended":
      await markAttendanceManually(supabase, ctx.org.id, webinarId, id, false); break;
    case "resend": {
      const { data: wf } = await supabase.from("automation_workflows").select("*").eq("webinar_id", webinarId).eq("key", "confirmation").maybeSingle();
      const r = await sendToParticipant(admin, {
        orgId: ctx.org.id, participantId: id, workflowId: wf?.id, defaultKey: "confirmation",
        sendWhatsapp: wf?.send_whatsapp ?? true, sendEmail: wf?.send_email ?? true,
        whatsappTemplateId: wf?.whatsapp_template_id, emailTemplateId: wf?.email_template_id,
      });
      revalidatePath(path);
      return back(path, r.errors.length ? `Sent with issues: ${r.errors.join("; ")}` : "Confirmation re-sent", r.errors.length ? "error" : "ok");
    }
  }
  revalidatePath(path);
  back(path, "Updated");
}

export async function importAttendance(formData: FormData) {
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const webinarId = s(formData, "webinar_id")!;
  const path = `/dashboard/webinars/${webinarId}/participants`;
  const file = formData.get("file") as File | null;
  if (!file?.size) return back(path, "Choose a CSV file", "error");
  try {
    const rows = parseCsv(await file.text());
    if (rows.length < 2) throw new Error("The CSV looks empty.");
    const r = await importAttendanceCsv(supabase, ctx.org.id, webinarId, rows, s(formData, "provider") || "csv_import");
    revalidatePath(path);
    return back(path, `Attendance imported: ${r.matched} matched, ${r.unmatched} not found among registrants.`);
  } catch (e: any) {
    return back(path, e.message, "error");
  }
}
