import Link from "next/link";
import { getOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";
import { Flash } from "@/components/ui/flash";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Webinars" };

export default async function Webinars({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; filter?: string }> }) {
  const sp = await searchParams;
  const ctx = await getOrgContext();
  const supabase = await createClient();
  let q = supabase.from("webinars").select("id, title, slug, starts_at, timezone, status, registration_type, platform, participants(count)")
    .eq("organization_id", ctx.org.id).order("starts_at", { ascending: sp.filter !== "past" });
  const now = new Date().toISOString();
  if (sp.filter === "past") q = q.lt("starts_at", now); else if (sp.filter !== "all") q = q.gte("starts_at", new Date(Date.now() - 6 * 3600_000).toISOString());
  const { data } = await q;

  return (
    <>
      <PageHeader title="Webinars" description="Create and manage webinars" actions={<Link href="/dashboard/webinars/new" className="btn-primary">+ New webinar</Link>} />
      <Flash searchParams={sp} />
      <div className="mb-4 flex gap-2 text-sm">
        {[["upcoming", "Upcoming"], ["past", "Past"], ["all", "All"]].map(([k, l]) => (
          <Link key={k} href={`?filter=${k}`} className={(sp.filter || "upcoming") === k ? "btn-secondary btn-sm border-brand-500 text-brand-700" : "btn-ghost btn-sm"}>{l}</Link>
        ))}
      </div>
      {data?.length ? (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Webinar</th><th>Date</th><th>Type</th><th>Registrations</th><th>Status</th></tr></thead>
            <tbody>
              {data.map((w) => (
                <tr key={w.id} className="hover:bg-slate-50">
                  <td><Link href={`/dashboard/webinars/${w.id}`} className="font-medium text-brand-700 hover:underline">{w.title}</Link>
                    <p className="text-xs text-slate-500">/e/{w.slug}</p></td>
                  <td>{formatDateTime(w.starts_at, w.timezone)}</td>
                  <td className="capitalize">{w.registration_type.replace("_", " ")} · {w.platform.replace("_", " ")}</td>
                  <td>{(w.participants as any)?.[0]?.count ?? 0}</td>
                  <td><StatusBadge status={w.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty title="No webinars here" description="Create your first webinar — it takes about two minutes." action={<Link href="/dashboard/webinars/new" className="btn-primary">Create webinar</Link>} />}
    </>
  );
}
