import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, fail, json, rateLimit } from "@/lib/http";
import { detectSource } from "@/lib/utils";

export async function POST(req: NextRequest) {
  if (!rateLimit(`track:${clientIp(req)}`, 120, 60_000)) return fail("rate limited", 429);
  const body = await req.json().catch(() => null);
  if (!body?.webinar_id || !["page_view", "form_start"].includes(body.event_type)) return fail("bad request");
  const db = createAdminClient();
  const { data: w } = await db.from("webinars").select("id, organization_id").eq("id", body.webinar_id).eq("status", "published").maybeSingle();
  if (!w) return json({ ok: true });
  const a = body.attribution || {};
  await db.from("analytics_events").insert({
    organization_id: w.organization_id, webinar_id: w.id, event_type: body.event_type, visitor_id: String(body.visitor_id || "").slice(0, 64) || null,
    source: detectSource(a, a.referrer), utm_source: a.utm_source || null, utm_medium: a.utm_medium || null, utm_campaign: a.utm_campaign || null,
    referrer: a.referrer ? String(a.referrer).slice(0, 500) : null,
  });
  return json({ ok: true });
}
