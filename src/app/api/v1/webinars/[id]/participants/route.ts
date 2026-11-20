import type { NextRequest } from "next/server";
import { apiContext } from "@/lib/api-auth";
import { fail, json } from "@/lib/http";
import { participantQuery } from "@/lib/participant-query";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext();
  if (!ctx) return fail("unauthorized", 401);
  const { id } = await params;
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const limit = Math.min(500, Number(sp.limit || 100)), offset = Number(sp.offset || 0);
  const { data, count } = await participantQuery(ctx.supabase, ctx.orgId, sp, id).range(offset, offset + limit - 1);
  return json({ data, count });
}
