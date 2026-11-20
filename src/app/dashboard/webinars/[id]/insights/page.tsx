import { BarChart, Stat } from "@/components/ui";
import { getFunnel } from "@/lib/analytics";
import { getWebinar } from "../data";

export default async function WebinarInsights({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, supabase } = await getWebinar(id);
  const f = await getFunnel(supabase, ctx.org.id, id, 30);
  const steps = [
    { label: "Unique visitors", v: f.uniqueVisitors }, { label: "Registered", v: f.registrations }, { label: "Confirmed", v: f.confirmed },
    { label: "Clicked join link", v: f.clicked }, { label: "Attended (verified)", v: f.attended },
  ];
  const top = Math.max(1, steps[0].v, steps[1].v);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Conversion" value={`${f.conversionRate}%`} sub="visitors → registrations" />
        <Stat label="Click rate" value={`${f.clickRate}%`} sub="confirmed → clicked" />
        <Stat label="Attendance rate" value={`${f.attendanceRate}%`} sub="confirmed → attended" />
        <Stat label="Avg. time attended" value={`${f.avgMinutes} min`} />
      </div>
      <div className="card-pad">
        <h2 className="mb-4 text-sm font-semibold">Funnel</h2>
        <div className="space-y-2">
          {steps.map((s) => (
            <div key={s.label} className="flex items-center gap-3 text-sm">
              <span className="w-40 shrink-0 text-slate-600">{s.label}</span>
              <div className="h-6 flex-1 rounded bg-slate-100"><div className="h-6 rounded bg-brand-500" style={{ width: `${(s.v / top) * 100}%` }} /></div>
              <span className="w-12 text-right font-medium">{s.v}</span>
            </div>
          ))}
        </div>
        <p className="hint mt-3">Join-link clicks and verified attendance are tracked separately — a click is not proof of attendance.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card-pad">
          <h2 className="mb-3 text-sm font-semibold">Registration sources</h2>
          <table className="table"><thead><tr><th>Source</th><th>Registrations</th><th>Attended</th><th>Show-up</th></tr></thead>
            <tbody>{f.bySource.map((s) => (
              <tr key={s.source}><td className="capitalize">{s.source}</td><td>{s.registrations}</td><td>{s.attended}</td><td>{s.registrations ? Math.round((s.attended / s.registrations) * 100) : 0}%</td></tr>
            ))}</tbody></table>
        </div>
        <div className="card-pad">
          <h2 className="mb-4 text-sm font-semibold">Registrations per day (30 days)</h2>
          <BarChart data={f.daily.map((d) => ({ label: d.day.slice(5), value: d.count }))} />
        </div>
      </div>
    </div>
  );
}
