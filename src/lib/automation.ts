import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendToParticipant } from "@/lib/messaging";
import type { WatiConfig } from "@/lib/providers/wati";
import { DEFAULT_WORKFLOWS } from "@/lib/templates";
import { webinarEnd } from "@/lib/utils";

type Db = SupabaseClient;

export async function seedDefaultWorkflows(db: Db, orgId: string, webinarId: string) {
  const rows = DEFAULT_WORKFLOWS.map((w, i) => ({
    organization_id: orgId, webinar_id: webinarId, key: w.key, name: w.name, trigger: w.trigger,
    offset_minutes: w.offset_minutes, segment: w.segment, position: i,
    send_whatsapp: true, send_email: true, enabled: true,
  }));
  await db.from("automation_workflows").upsert(rows, { onConflict: "webinar_id,key", ignoreDuplicates: true });
}

type Wf = { id: string; trigger: string; offset_minutes: number; enabled: boolean };
type Wb = { starts_at: string; duration_minutes: number };

export function runAtFor(wf: Wf, w: Wb): Date | null {
  const start = new Date(w.starts_at).getTime();
  switch (wf.trigger) {
    case "before_start": return new Date(start - wf.offset_minutes * 60_000);
    case "at_start": return new Date(start + wf.offset_minutes * 60_000);
    case "after_end": return new Date(webinarEnd(w).getTime() + wf.offset_minutes * 60_000);
    default: return null; // registration_confirmed runs immediately
  }
}

/** Creates pending jobs for one participant for every enabled time-based workflow still in the future. */
export async function scheduleJobsForParticipant(db: Db, orgId: string, participantId: string, webinar: Wb & { id: string }) {
  const { data: wfs } = await db.from("automation_workflows").select("id, trigger, offset_minutes, enabled")
    .eq("webinar_id", webinar.id).eq("enabled", true).neq("trigger", "registration_confirmed");
  const now = Date.now() - 2 * 60_000;
  const jobs = (wfs || [])
    .map((wf) => ({ wf, at: runAtFor(wf, webinar) }))
    .filter((x) => x.at && x.at.getTime() >= now)
    .map((x) => ({ organization_id: orgId, workflow_id: x.wf.id, participant_id: participantId, run_at: x.at!.toISOString() }));
  if (jobs.length) await db.from("automation_jobs").upsert(jobs, { onConflict: "workflow_id,participant_id", ignoreDuplicates: true });
}

/** Rebuild the queue after a webinar's time or its workflows change. */
export async function rescheduleWebinar(db: Db, orgId: string, webinarId: string) {
  const { data: w } = await db.from("webinars").select("id, starts_at, duration_minutes, status").eq("id", webinarId).single();
  if (!w) return;
  const { data: wfs } = await db.from("automation_workflows").select("id").eq("webinar_id", webinarId);
  const ids = (wfs || []).map((x) => x.id);
  if (ids.length) await db.from("automation_jobs").delete().in("workflow_id", ids).eq("status", "pending");
  if (w.status === "cancelled") return;
  const { data: ps } = await db.from("participants").select("id").eq("webinar_id", webinarId).eq("status", "confirmed");
  for (const p of ps || []) await scheduleJobsForParticipant(db, orgId, p.id, w);
}

/** Run immediately-triggered workflows (confirmation) for a newly confirmed participant. */
export async function runImmediateWorkflows(db: Db, orgId: string, participantId: string, webinarId: string) {
  const { data: wfs } = await db.from("automation_workflows").select("*")
    .eq("webinar_id", webinarId).eq("enabled", true).eq("trigger", "registration_confirmed").order("position");
  for (const wf of wfs || []) {
    await sendToParticipant(db, {
      orgId, participantId, workflowId: wf.id, defaultKey: wf.key,
      sendWhatsapp: wf.send_whatsapp, sendEmail: wf.send_email,
      whatsappTemplateId: wf.whatsapp_template_id, emailTemplateId: wf.email_template_id,
    });
  }
}

export function matchesSegment(segment: string, p: { attended: boolean; join_link_clicked: boolean }) {
  switch (segment) {
    case "attended": return p.attended;
    case "absent": return !p.attended;
    case "clicked_not_attended": return p.join_link_clicked && !p.attended;
    default: return true;
  }
}

/** Cron worker: claims due jobs and sends them. Safe to run every minute. */
export async function processDueJobs(db: Db, limit = 100) {
  const { data: due } = await db.from("automation_jobs").select("id")
    .eq("status", "pending").lte("run_at", new Date().toISOString()).order("run_at").limit(limit);
  const stats = { claimed: 0, done: 0, skipped: 0, failed: 0 };
  const watiCache = new Map<string, { wati?: WatiConfig | null }>();

  for (const { id } of due || []) {
    // claim atomically so overlapping cron runs never double-send
    const { data: job } = await db.from("automation_jobs")
      .update({ status: "running" }).eq("id", id).eq("status", "pending")
      .select("id, organization_id, participant_id, attempts, automation_workflows(*), participants(status, attended, join_link_clicked, webinars(status))")
      .maybeSingle();
    if (!job) continue;
    stats.claimed++;
    const wf = job.automation_workflows as any;
    const p = job.participants as any;
    const finish = (status: string, err?: string) =>
      db.from("automation_jobs").update({ status, last_error: err || null, executed_at: new Date().toISOString(), attempts: job.attempts + 1 }).eq("id", job.id);

    if (!wf?.enabled || !p || p.status !== "confirmed" || p.webinars?.status === "cancelled" || !matchesSegment(wf.segment, p)) {
      await finish("skipped"); stats.skipped++; continue;
    }
    try {
      if (!watiCache.has(job.organization_id)) watiCache.set(job.organization_id, {});
      const r = await sendToParticipant(db, {
        orgId: job.organization_id, participantId: job.participant_id, workflowId: wf.id, defaultKey: wf.key,
        sendWhatsapp: wf.send_whatsapp, sendEmail: wf.send_email,
        whatsappTemplateId: wf.whatsapp_template_id, emailTemplateId: wf.email_template_id,
      }, watiCache.get(job.organization_id));
      const allFailed = (r.whatsapp === "failed" || r.whatsapp === "skipped") && (r.email === "failed" || r.email === "skipped") && r.errors.length > 0;
      if (allFailed && job.attempts < 2) {
        await db.from("automation_jobs").update({
          status: "pending", attempts: job.attempts + 1, last_error: r.errors.join("; "),
          run_at: new Date(Date.now() + 5 * 60_000).toISOString(),
        }).eq("id", job.id);
        stats.failed++;
      } else {
        await finish(allFailed ? "failed" : "done", r.errors.join("; ") || undefined);
        allFailed ? stats.failed++ : stats.done++;
      }
    } catch (e: any) {
      await finish("failed", e?.message); stats.failed++;
    }
  }
  return stats;
}
