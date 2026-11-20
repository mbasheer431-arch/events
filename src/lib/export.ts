import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { participantQuery } from "@/lib/participant-query";
import { csvEscape } from "@/lib/utils";

export async function participantsCsv(db: SupabaseClient, orgId: string, sp: Record<string, string | undefined>, webinarId?: string) {
  const { data } = await participantQuery(db, orgId, sp, webinarId).limit(20000);
  const ids = (data || []).map((p: any) => p.id);
  const answers = new Map<string, Record<string, string>>();
  const labels = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data: ans } = await db.from("participant_answers").select("participant_id, question_label, answer").in("participant_id", ids.slice(i, i + 500));
    for (const a of ans || []) {
      labels.add(a.question_label);
      answers.set(a.participant_id, { ...(answers.get(a.participant_id) || {}), [a.question_label]: a.answer || "" });
    }
  }
  const cols = ["participant_code", "full_name", "email", "phone", "company", "designation", "location", "webinar", "ticket", "status", "payment_status",
    "source", "utm_source", "utm_medium", "utm_campaign", "confirmation_status", "reminder_status", "join_link_clicked", "first_clicked_at",
    "attended", "join_time", "leave_time", "attended_minutes", "followup_status", "consent_whatsapp", "created_at"];
  const qLabels = [...labels];
  const lines = [[...cols, ...qLabels].map(csvEscape).join(",")];
  for (const p of (data || []) as any[]) {
    const row = cols.map((c) => c === "webinar" ? p.webinars?.title : c === "ticket" ? p.tickets?.name || "Free" : p[c]);
    lines.push([...row, ...qLabels.map((l) => answers.get(p.id)?.[l] || "")].map(csvEscape).join(","));
  }
  return new NextResponse("\uFEFF" + lines.join("\r\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="participants-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
