import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeEqual } from "@/lib/crypto";
import { fail, json } from "@/lib/http";
import { processDueJobs } from "@/lib/automation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || req.nextUrl.searchParams.get("secret") || "";
  if (!expected || !safeEqual(expected, got)) return fail("unauthorized", 401);
  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("limit") || 40)));
  const stats = await processDueJobs(createAdminClient(), limit);
  return json({ ok: true, ...stats, at: new Date().toISOString() });
}
export const GET = run;   // Vercel Cron sends GET with Authorization: Bearer CRON_SECRET
export const POST = run;  // Supabase pg_cron / cron-job.org
