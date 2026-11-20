import type { NextRequest } from "next/server";
import { apiContext } from "@/lib/api-auth";
import { fail, json } from "@/lib/http";

export async function GET(req: NextRequest) {
  const ctx = await apiContext();
  if (!ctx) return fail("unauthorized", 401);
  let q = ctx.supabase.from("automation_workflows").select("*").eq("organization_id", ctx.orgId).order("position");
  const w = req.nextUrl.searchParams.get("webinar_id");
  if (w) q = q.eq("webinar_id", w);
  const { data } = await q;
  return json({ data });
}
