import Link from "next/link";
import { getOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { getFunnel } from "@/lib/analytics";
import { BarChart, Empty, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Overview" };

export default async function Overview() {
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const [funnel, { data: upcoming }, { data: recent }] = await Promise.all([
    getFunnel(supabase, ctx.org.id, null, 30),
    supabase.from("webinars").select("id, title, starts_at, timezone, status").eq("organization_id", ctx.org.id)
      .gte("starts_at", new Date(Date.now() - 3 * 3600_000).toISOString()).neq("status", "cancelled").order("starts_at").limit(5),
    supabase.from("participants").select("id, full_name, email, source, status, created_at, webinars(title)").eq("organization_id", ctx.org.id)
      .order("created_at", { ascending: false }).limit(8),
  ]);

  return (
    <>
      <PageHeader title={`Welcome back`} description={`${ctx.org.name} · registrations and performance`}
        actions={<Link href="/dashboard/webinars/new" className="btn-primary">+ New webinar</Link>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Registrations" value={funnel.registrations} sub={`${funnel.pending} pending`} />
        <Stat label="Page → registration" value={`${funnel.conversionRate}%`} sub={`${funnel.uniqueVisitors} unique visitors`} />
        <Stat label="Join-link clicks" value={`${funnel.clickRate}%`} sub={`${funnel.clicked} participants clicked`} />
        <Stat label="Attendance" value={`${funnel.attendanceRate}%`} sub={`${funnel.attended} verified attendees`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card-pad lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold">Registrations — last 30 days</h2>
          <BarChart data={funnel.daily.map((d) => ({ label: d.day.slice(5), value: d.count }))} />
        </div>
        <div className="card-pad">
          <h2 className="mb-3 text-sm font-semibold">Upcoming webinars</h2>
          {upcoming?.length ? (
            <ul className="space-y-3">
              {upcoming.map((w) => (
                <li key={w.id}>
                  <Link href={`/dashboard/webinars/${w.id}`} className="block rounded-lg p-2 hover:bg-slate-50">
                    <p className="text-sm font-medium">{w.title}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">{formatDateTime(w.starts_at, w.timezone)} <StatusBadge status={w.status} /></p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-500">Nothing scheduled.</p>}
        </div>
      </div>
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold">Latest registrations</h2>
        {recent?.length ? (
          <div className="card overflow-x-auto">
            <table className="table">
              <thead><tr><th>Name</th><th>Webinar</th><th>Source</th><th>Status</th><th>Registered</th></tr></thead>
              <tbody>
                {recent.map((p) => (
                  <tr key={p.id}><td><p className="font-medium">{p.full_name}</p><p className="text-xs text-slate-500">{p.email}</p></td>
                    <td>{(p.webinars as any)?.title}</td><td className="capitalize">{p.source}</td><td><StatusBadge status={p.status} /></td>
                    <td className="text-slate-500">{formatDateTime(p.created_at, ctx.org.timezone)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="No registrations yet" description="Create and publish a webinar, then share its registration link." />}
      </div>
    </>
  );
}
