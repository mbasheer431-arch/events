import { apiContext } from "@/lib/api-auth";
import { getFunnel } from "@/lib/analytics";
import { fail, json } from "@/lib/http";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext();
  if (!ctx) return fail("unauthorized", 401);
  const { id } = await params;
  return json({ data: await getFunnel(ctx.supabase, ctx.orgId, id) });
}
