import { apiContext } from "@/lib/api-auth";
import { fail, json } from "@/lib/http";
import { getWatiConfig } from "@/lib/messaging";
import { watiListTemplates } from "@/lib/providers/wati";

export async function GET() {
  const ctx = await apiContext();
  if (!ctx) return fail("unauthorized", 401);
  const cfg = await getWatiConfig(ctx.supabase, ctx.orgId);
  if (!cfg) return fail("WATI not connected", 404);
  try { return json({ data: await watiListTemplates(cfg) }); } catch (e: any) { return fail(e.message, 502); }
}
