import Link from "next/link";
import { getOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { participantQuery } from "@/lib/participant-query";
import { Empty, PageHeader } from "@/components/ui";
import { Flash } from "@/components/ui/flash";
import { ParticipantFilters, ParticipantTable, type ParticipantRow } from "@/components/participants/table";

export const metadata = { title: "Participants" };
const PAGE = 50;

export default async function Participants({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const page = Math.max(1, Number(sp.page || 1));
  const [{ data, count }, { data: webinars }, { data: srcRows }] = await Promise.all([
    participantQuery(supabase, ctx.org.id, sp).range((page - 1) * PAGE, page * PAGE - 1),
    supabase.from("webinars").select("id, title").eq("organization_id", ctx.org.id).order("starts_at", { ascending: false }).limit(100),
    supabase.from("participants").select("source").eq("organization_id", ctx.org.id).limit(5000),
  ]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]);
  return (
    <>
      <PageHeader title="Participants" description={`${count ?? 0} registrations across all webinars`}
        actions={<a href={`/api/v1/participants/export?${qs}`} className="btn-secondary">Export CSV</a>} />
      <Flash searchParams={sp} />
      <ParticipantFilters sp={sp} sources={[...new Set((srcRows || []).map((r) => r.source))]}
        extra={<select name="webinar" defaultValue={sp.webinar || ""} className="input w-64">
          <option value="">All webinars</option>{(webinars || []).map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}</select>} />
      {data?.length ? <ParticipantTable rows={data as unknown as ParticipantRow[]} tz={ctx.org.timezone} showWebinar /> : <Empty title="No participants found" />}
      {(count || 0) > PAGE && (
        <div className="mt-4 flex justify-end gap-2">
          {page > 1 && <Link className="btn-secondary btn-sm" href={`?${qs}&page=${page - 1}`}>Previous</Link>}
          {page * PAGE < (count || 0) && <Link className="btn-secondary btn-sm" href={`?${qs}&page=${page + 1}`}>Next</Link>}
        </div>
      )}
    </>
  );
}
