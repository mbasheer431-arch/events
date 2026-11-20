import Link from "next/link";
import { Empty } from "@/components/ui";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/submit";
import { ParticipantFilters, ParticipantTable, type ParticipantRow } from "@/components/participants/table";
import { participantQuery } from "@/lib/participant-query";
import { importAttendance } from "../../actions";
import { getWebinar } from "../data";

const PAGE = 50;

export default async function WebinarParticipants({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { webinar: w, ctx, supabase } = await getWebinar(id);
  const page = Math.max(1, Number(sp.page || 1));
  const { data, count } = await participantQuery(supabase, ctx.org.id, sp, id).range((page - 1) * PAGE, page * PAGE - 1);
  const { data: srcRows } = await supabase.from("participants").select("source").eq("webinar_id", id).limit(5000);
  const sources = [...new Set((srcRows || []).map((r) => r.source))];
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page" && k !== "ok" && k !== "error") as [string, string][]);

  return (
    <>
      <Flash searchParams={sp} />
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <ParticipantFilters sp={sp} sources={sources} />
        <a href={`/api/v1/webinars/${id}/participants/export?${qs}`} className="btn-secondary">Export CSV</a>
      </div>
      {data?.length ? <ParticipantTable rows={data as unknown as ParticipantRow[]} tz={w.timezone} />
        : <Empty title="No participants match" description="Share your registration link to start collecting registrations." />}
      {(count || 0) > PAGE && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>{count} participants</span>
          <div className="flex gap-2">
            {page > 1 && <Link className="btn-secondary btn-sm" href={`?${qs}&page=${page - 1}`}>Previous</Link>}
            {page * PAGE < (count || 0) && <Link className="btn-secondary btn-sm" href={`?${qs}&page=${page + 1}`}>Next</Link>}
          </div>
        </div>
      )}
      <div className="card-pad mt-6">
        <h2 className="text-sm font-semibold">Import attendance from a CSV</h2>
        <p className="hint mb-3">Use the Zoom attendance report or Google Meet attendance export. Rows are matched to registrants by email, then by exact name. Clicking the join link alone never counts as attendance.</p>
        <form action={importAttendance} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="webinar_id" value={id} />
          <input type="file" name="file" accept=".csv,text/csv" className="input w-auto" />
          <select name="provider" className="input w-auto"><option value="zoom">Zoom report</option><option value="google_meet">Google Meet</option><option value="csv_import">Other</option></select>
          <SubmitButton className="btn-secondary" pendingText="Importing…">Import</SubmitButton>
        </form>
      </div>
    </>
  );
}
