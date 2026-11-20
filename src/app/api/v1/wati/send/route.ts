import type { NextRequest } from "next/server";
import { apiContext } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, json } from "@/lib/http";
import { sendToParticipant } from "@/lib/messaging";

/** POST { participant_id, template_id } — send a mapped WhatsApp template to one participant. */
export async function POST(req: NextRequest) {
  const ctx = await apiContext();
  if (!ctx) return fail("unauthorized", 401);
  const b = await req.json().catch(() => ({}));
  const { data: p } = await ctx.supabase.from("participants").select("id").eq("id", b.participant_id).eq("organization_id", ctx.orgId).maybeSingle();
  if (!p) return fail("participant not found", 404);
  const r = await sendToParticipant(createAdminClient(), { orgId: ctx.orgId, participantId: p.id, defaultKey: "campaign", sendWhatsapp: true, sendEmail: false, whatsappTemplateId: b.template_id });
  return json(r, r.whatsapp === "sent" ? 200 : 422);
}
