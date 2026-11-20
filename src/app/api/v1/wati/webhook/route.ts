import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeEqual } from "@/lib/crypto";
import { fail, json } from "@/lib/http";
import { watiEventToStatus } from "@/lib/providers/wati";

const RANK: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

/** WATI delivery webhook: ?org=<orgId>&secret=<webhook_secret>. Updates message_logs + participant roll-ups. */
export async function POST(req: NextRequest) {
  const org = req.nextUrl.searchParams.get("org") || "";
  const secret = req.nextUrl.searchParams.get("secret") || "";
  const db = createAdminClient();
  const { data: conn } = await db.from("wati_connections").select("webhook_secret").eq("organization_id", org).maybeSingle();
  if (!conn || !safeEqual(conn.webhook_secret, secret)) return fail("unauthorized", 401);

  const evt = await req.json().catch(() => null);
  if (!evt) return fail("bad payload");
  const events = Array.isArray(evt) ? evt : [evt];
  for (const e of events) {
    const type = String(e.eventType || "");
    const status = watiEventToStatus(type);
    await db.from("webhook_events").insert({ organization_id: org, provider: "wati", event_type: type, external_id: e.localMessageId || e.whatsappMessageId || null, payload: e, processed: !!status });
    if (!status || !e.localMessageId) continue;

    const { data: log } = await db.from("message_logs").select("id, status, participant_id, workflow_id, automation_workflows(key)")
      .eq("organization_id", org).eq("provider", "wati").eq("provider_message_id", e.localMessageId).maybeSingle();
    if (!log) continue;
    // never move backwards (e.g. a late "sent" after "read"); failed always wins
    if (status !== "failed" && RANK[status] <= RANK[log.status]) continue;
    await db.from("message_logs").update({
      status, status_updated_at: new Date().toISOString(),
      error: status === "failed" ? [e.failedCode, e.failedDetail].filter(Boolean).join(" ") || "Failed" : null,
    }).eq("id", log.id);

    const key = (log.automation_workflows as any)?.key as string | undefined;
    if (log.participant_id && key) {
      const field = key === "confirmation" ? "confirmation_status" : key.startsWith("reminder") || key === "starting_15m" ? "reminder_status" : null;
      if (field) await db.from("participants").update({ [field]: status === "read" ? "delivered" : status }).eq("id", log.participant_id);
    }
  }
  return json({ ok: true });
}
