import type { NextRequest } from "next/server";
import { apiContext } from "@/lib/api-auth";
import { rescheduleWebinar } from "@/lib/automation";
import { fail, json } from "@/lib/http";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext();
  if (!ctx) return fail("unauthorized", 401);
  const { id } = await params;
  const { data } = await ctx.supabase.from("automation_workflows").select("*").eq("id", id).eq("organization_id", ctx.orgId).maybeSingle();
  return data ? json({ data }) : fail("not found", 404);
}

/** PATCH { enabled?, offset_minutes?, segment?, send_whatsapp?, send_email?, whatsapp_template_id?, email_template_id? } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext();
  if (!ctx) return fail("unauthorized", 401);
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const allowed = ["enabled", "offset_minutes", "segment", "send_whatsapp", "send_email", "whatsapp_template_id", "email_template_id"];
  const patch = Object.fromEntries(Object.entries(b).filter(([k]) => allowed.includes(k)));
  const { data, error } = await ctx.supabase.from("automation_workflows").update(patch).eq("id", id).eq("organization_id", ctx.orgId).select().maybeSingle();
  if (error || !data) return fail(error?.message || "not found", 400);
  await rescheduleWebinar(ctx.supabase, ctx.orgId, data.webinar_id);
  return json({ data });
}
