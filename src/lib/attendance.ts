import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pushCrmEvent } from "@/lib/providers/crm";

type Db = SupabaseClient;

async function findParticipant(db: Db, webinarId: string, email?: string | null, name?: string | null) {
  if (email) {
    const { data } = await db.from("participants").select("id, attended").eq("webinar_id", webinarId).eq("email", email.toLowerCase()).maybeSingle();
    if (data) return data;
  }
  if (name) {
    const { data } = await db.from("participants").select("id, attended").eq("webinar_id", webinarId).ilike("full_name", name.trim()).limit(2);
    if (data?.length === 1) return data[0]; // only accept an unambiguous name match
  }
  return null;
}

/** Recompute attended / join / leave / minutes from all attendance records of a participant. */
export async function rollupParticipant(db: Db, orgId: string, participantId: string) {
  const { data: recs } = await db.from("attendance_records").select("join_time, leave_time, duration_seconds").eq("participant_id", participantId);
  if (!recs?.length) return;
  const joins = recs.map((r) => r.join_time).filter(Boolean).sort();
  const leaves = recs.map((r) => r.leave_time).filter(Boolean).sort();
  const secs = recs.reduce((s, r) => s + (r.duration_seconds || 0), 0);
  const { data: before } = await db.from("participants").select("attended, participant_code, full_name, email, webinar_id").eq("id", participantId).single();
  await db.from("participants").update({
    attended: true, join_time: joins[0] || null, leave_time: leaves[leaves.length - 1] || null, attended_minutes: Math.round(secs / 60),
  }).eq("id", participantId);
  if (before && !before.attended) {
    await pushCrmEvent(orgId, "participant.attended", { participant_id: before.participant_code, name: before.full_name, email: before.email, webinar_id: before.webinar_id });
  }
}

/** Zoom: participant joined -> open record */
export async function zoomJoined(db: Db, orgId: string, webinarId: string, z: { id?: string; user_name?: string; email?: string; join_time?: string; participant_uuid?: string }, raw: unknown) {
  const p = await findParticipant(db, webinarId, z.email, z.user_name);
  await db.from("attendance_records").insert({
    organization_id: orgId, webinar_id: webinarId, participant_id: p?.id || null, provider: "zoom",
    provider_participant_id: z.participant_uuid || z.id || null, name: z.user_name || null, email: z.email?.toLowerCase() || null,
    join_time: z.join_time || new Date().toISOString(), raw,
  });
  if (p) await rollupParticipant(db, orgId, p.id);
}

/** Zoom: participant left -> close latest open record */
export async function zoomLeft(db: Db, orgId: string, webinarId: string, z: { id?: string; user_name?: string; email?: string; leave_time?: string; participant_uuid?: string }, raw: unknown) {
  const leave = z.leave_time || new Date().toISOString();
  let q = db.from("attendance_records").select("id, join_time, participant_id").eq("webinar_id", webinarId).eq("provider", "zoom").is("leave_time", null);
  const pid = z.participant_uuid || z.id;
  q = pid ? q.eq("provider_participant_id", pid) : z.email ? q.eq("email", z.email.toLowerCase()) : q.eq("name", z.user_name || "");
  const { data: open } = await q.order("join_time", { ascending: false }).limit(1).maybeSingle();
  if (open) {
    const dur = Math.max(0, Math.round((new Date(leave).getTime() - new Date(open.join_time).getTime()) / 1000));
    await db.from("attendance_records").update({ leave_time: leave, duration_seconds: dur }).eq("id", open.id);
    if (open.participant_id) await rollupParticipant(db, orgId, open.participant_id);
  } else {
    const p = await findParticipant(db, webinarId, z.email, z.user_name);
    await db.from("attendance_records").insert({
      organization_id: orgId, webinar_id: webinarId, participant_id: p?.id || null, provider: "zoom",
      provider_participant_id: pid || null, name: z.user_name || null, email: z.email?.toLowerCase() || null, leave_time: leave, raw,
    });
  }
}

/**
 * CSV import (Zoom attendance report, Google Meet attendance CSV, or any sheet).
 * Detects columns: email, name, join time, leave time, duration (minutes).
 */
export async function importAttendanceCsv(db: Db, orgId: string, webinarId: string, rows: string[][], provider = "csv_import") {
  const header = rows[0].map((h) => h.toLowerCase().trim());
  const col = (...names: RegExp[]) => header.findIndex((h) => names.some((n) => n.test(h)));
  const iEmail = col(/e-?mail/);
  const iName = col(/^name|full name|participant|user name/);
  const iJoin = col(/join/);
  const iLeave = col(/leave/);
  const iDur = col(/duration|minutes|time in call|attended/);
  if (iEmail < 0 && iName < 0) throw new Error("CSV needs an Email or Name column.");

  let matched = 0, unmatched = 0;
  const touched = new Set<string>();
  for (const r of rows.slice(1)) {
    const email = iEmail >= 0 ? r[iEmail]?.trim() : "";
    const name = iName >= 0 ? r[iName]?.trim() : "";
    if (!email && !name) continue;
    const p = await findParticipant(db, webinarId, email, name);
    const toIso = (v?: string) => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString(); };
    const durRaw = iDur >= 0 ? r[iDur] : "";
    const durMin = durRaw ? parseFloat(String(durRaw).replace(/[^\d.]/g, "")) : NaN;
    await db.from("attendance_records").insert({
      organization_id: orgId, webinar_id: webinarId, participant_id: p?.id || null, provider,
      name: name || null, email: email?.toLowerCase() || null,
      join_time: toIso(r[iJoin]), leave_time: toIso(r[iLeave]),
      duration_seconds: isNaN(durMin) ? null : Math.round(durMin * 60), raw: { row: r },
    });
    if (p) { matched++; touched.add(p.id); } else unmatched++;
  }
  for (const id of touched) await rollupParticipant(db, orgId, id);
  return { matched, unmatched };
}

export async function markAttendanceManually(db: Db, orgId: string, webinarId: string, participantId: string, attended: boolean) {
  if (attended) {
    await db.from("attendance_records").insert({ organization_id: orgId, webinar_id: webinarId, participant_id: participantId, provider: "manual" });
    await db.from("participants").update({ attended: true }).eq("id", participantId);
  } else {
    await db.from("attendance_records").delete().eq("participant_id", participantId);
    await db.from("participants").update({ attended: false, join_time: null, leave_time: null, attended_minutes: 0 }).eq("id", participantId);
  }
}
