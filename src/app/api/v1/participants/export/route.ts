import type { NextRequest } from "next/server";
import { apiContext } from "@/lib/api-auth";
import { participantsCsv } from "@/lib/export";
import { fail } from "@/lib/http";

export async function GET(req: NextRequest) {
  const ctx = await apiContext();
  if (!ctx) return fail("unauthorized", 401);
  return participantsCsv(ctx.supabase, ctx.orgId, Object.fromEntries(req.nextUrl.searchParams));
}
