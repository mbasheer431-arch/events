import { getOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { getFunnel } from "@/lib/analytics";
import { BarChart, PageHeader, Stat } from "@/components/ui";
import { formatDateTime, formatMoney } from "@/lib/utils";

export const metadata = { title: "Analytics" };

export default async function Analytics() {
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const [f, { data: webinars }, { data: parts }, { data: views }] = await Promise.all([
    getFunnel(supabase, ctx.org.id, null, 30),
    supabase.from("webinars").select("id, title, starts_at, timezone").eq("organization_id", ctx.org.id).order("starts_at", { ascending: false }).limit(30),
    supabase.from("participants").select("webinar_id, status, attended, join_link_clicked").eq("organization_id", ctx.org.id).limit(50000),
    supabase.from("analytics_events").select("webinar_id").eq("organization_id", ctx.org.id).eq("event_type", "page_view").limit(100000),
  ]);
  const per = (webinars || []).map((w) => {
    const ps = (parts || []).filter((p) => p.webinar_id === w.id && p.status !== "cancelled" && p.status !== "rejected");
    const conf = ps.filter((p) => p.status === "confirmed");
    const v = (views || []).filter((x) => x.webinar_id === w.id).length;
    return { ...w, views: v, regs: ps.length, clicked: conf.filter((p) => p.join_link_clicked).length, attended: conf.filter((p) => p.attended).length, conf: conf.length };
  });
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  return (
    <>
      <PageHeader title="Analytics" description="Performance and conversion across all webinars" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Page views" value={f.pageViews} sub={`${f.uniqueVisitors} unique`} />
        <Stat label="Registrations" value={f.registrations} sub={`${f.conversionRate}% conversion`} />
        <Stat label="Clicked join link" value={`${f.clickRate}%`} />
        <Stat label="Attendance" value={`${f.attendanceRate}%`} sub={`avg ${f.avgMinutes} min`} />
        <Stat label="Revenue" value={formatMoney(f.paidRevenueMinor)} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card-pad lg:col-span-2"><h2 className="mb-4 text-sm font-semibold">Registrations — last 30 days</h2>
          <BarChart data={f.daily.map((d) => ({ label: d.day.slice(5), value: d.count }))} /></div>
        <div className="card-pad"><h2 className="mb-3 text-sm font-semibold">By source</h2>
          <table className="table"><thead><tr><th>Source</th><th>Regs</th><th>Show-up</th></tr></thead>
            <tbody>{f.bySource.map((s) => <tr key={s.source}><td className="capitalize">{s.source}</td><td>{s.registrations}</td><td>{pct(s.attended, s.registrations)}</td></tr>)}</tbody></table></div>
      </div>
      <div className="card mt-6 overflow-x-auto">
        <table className="table"><thead><tr><th>Webinar</th><th>Date</th><th>Views</th><th>Registrations</th><th>Conversion</th><th>Clicked</th><th>Attended</th><th>Attendance rate</th></tr></thead>
          <tbody>{per.map((w) => (
            <tr key={w.id}><td className="font-medium">{w.title}</td><td>{formatDateTime(w.starts_at, w.timezone)}</td><td>{w.views}</td><td>{w.regs}</td>
              <td>{pct(w.regs, w.views)}</td><td>{w.clicked}</td><td>{w.attended}</td><td>{pct(w.attended, w.conf)}</td></tr>
          ))}</tbody></table>
      </div>
    </>
  );
}
