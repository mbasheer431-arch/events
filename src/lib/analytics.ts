import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { format, subDays } from "date-fns";

type Db = SupabaseClient;

export type Funnel = {
  pageViews: number; uniqueVisitors: number; registrations: number; confirmed: number; pending: number;
  clicked: number; attended: number; paidRevenueMinor: number;
  conversionRate: number; clickRate: number; attendanceRate: number;
  bySource: { source: string; registrations: number; attended: number }[];
  daily: { day: string; count: number }[];
  avgMinutes: number;
};

/** Funnel metrics for one webinar, or for all webinars of an org when webinarId is null. */
export async function getFunnel(db: Db, orgId: string, webinarId: string | null, days = 30): Promise<Funnel> {
  let pv = db.from("analytics_events").select("visitor_id").eq("organization_id", orgId).eq("event_type", "page_view").limit(50000);
  let ps = db.from("participants").select("status, source, created_at, join_link_clicked, attended, attended_minutes").eq("organization_id", orgId).limit(50000);
  let od = db.from("orders").select("amount_minor").eq("organization_id", orgId).eq("status", "paid").limit(50000);
  if (webinarId) { pv = pv.eq("webinar_id", webinarId); ps = ps.eq("webinar_id", webinarId); od = od.eq("webinar_id", webinarId); }
  const [{ data: views }, { data: parts }, { data: orders }] = await Promise.all([pv, ps, od]);

  const all = (parts || []).filter((p) => p.status !== "cancelled" && p.status !== "rejected");
  const confirmed = all.filter((p) => p.status === "confirmed");
  const attended = confirmed.filter((p) => p.attended);
  const clicked = confirmed.filter((p) => p.join_link_clicked);
  const uniq = new Set((views || []).map((v) => v.visitor_id).filter(Boolean));
  const uniqueVisitors = uniq.size || (views || []).length;

  const srcMap = new Map<string, { registrations: number; attended: number }>();
  for (const p of all) {
    const s = srcMap.get(p.source) || { registrations: 0, attended: 0 };
    s.registrations++; if (p.attended) s.attended++;
    srcMap.set(p.source, s);
  }
  const dayMap = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) dayMap.set(format(subDays(new Date(), i), "yyyy-MM-dd"), 0);
  for (const p of all) {
    const d = p.created_at.slice(0, 10);
    if (dayMap.has(d)) dayMap.set(d, (dayMap.get(d) || 0) + 1);
  }
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

  return {
    pageViews: (views || []).length, uniqueVisitors,
    registrations: all.length, confirmed: confirmed.length, pending: all.length - confirmed.length,
    clicked: clicked.length, attended: attended.length,
    paidRevenueMinor: (orders || []).reduce((s, o) => s + o.amount_minor, 0),
    conversionRate: pct(all.length, uniqueVisitors), clickRate: pct(clicked.length, confirmed.length), attendanceRate: pct(attended.length, confirmed.length),
    bySource: [...srcMap.entries()].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.registrations - a.registrations),
    daily: [...dayMap.entries()].map(([day, count]) => ({ day, count })),
    avgMinutes: attended.length ? Math.round(attended.reduce((s, p) => s + (p.attended_minutes || 0), 0) / attended.length) : 0,
  };
}
