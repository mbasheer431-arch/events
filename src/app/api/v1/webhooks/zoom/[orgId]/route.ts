import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptJson } from "@/lib/crypto";
import { fail, json } from "@/lib/http";
import { verifyZoomSignature, zoomUrlValidation } from "@/lib/providers/zoom";
import { zoomJoined, zoomLeft } from "@/lib/attendance";

/** Zoom event subscription endpoint — actual attendance (joined / left). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const raw = await req.text();
  const db = createAdminClient();
  const { data: integ } = await db.from("integrations").select("secrets_encrypted, enabled").eq("organization_id", orgId).eq("provider", "zoom").maybeSingle();
  const secret = decryptJson<{ secret_token?: string }>(integ?.secrets_encrypted)?.secret_token;
  if (!secret) return fail("zoom not configured", 404);
  const evt = JSON.parse(raw || "{}");

  if (evt.event === "endpoint.url_validation") return json(zoomUrlValidation(secret, evt.payload?.plainToken));
  if (!verifyZoomSignature(secret, raw, req.headers.get("x-zm-request-timestamp"), req.headers.get("x-zm-signature"))) return fail("invalid signature", 401);

  const obj = evt.payload?.object || {};
  const { data: logged } = await db.from("webhook_events").insert({ organization_id: orgId, provider: "zoom", event_type: evt.event, external_id: String(obj.uuid || ""), payload: evt }).select("id").single();
  try {
    const meetingId = String(obj.id || "").replace(/\D/g, "");
    const { data: webinar } = await db.from("webinars").select("id").eq("organization_id", orgId).eq("meeting_id", meetingId).order("starts_at", { ascending: false }).limit(1).maybeSingle();
    if (webinar) {
      if (/participant_joined$/.test(evt.event)) await zoomJoined(db, orgId, webinar.id, obj.participant || {}, evt);
      if (/participant_left$/.test(evt.event)) await zoomLeft(db, orgId, webinar.id, obj.participant || {}, evt);
    }
    await db.from("webhook_events").update({ processed: true, error: webinar ? null : `no webinar with meeting_id ${meetingId}` }).eq("id", logged?.id);
  } catch (e: any) {
    await db.from("webhook_events").update({ error: e?.message }).eq("id", logged?.id);
  }
  return json({ ok: true });
}
