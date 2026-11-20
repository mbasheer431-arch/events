import { StatusBadge, Badge } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit";
import { formatDateTime } from "@/lib/utils";
import { participantAction } from "@/app/dashboard/webinars/actions";

export type ParticipantRow = {
  id: string; webinar_id: string; participant_code: string; full_name: string; email: string; phone: string | null; source: string;
  status: string; payment_status: string; confirmation_status: string; reminder_status: string; followup_status: string;
  join_link_clicked: boolean; attended: boolean; join_time: string | null; leave_time: string | null; attended_minutes: number;
  created_at: string; webinars?: { title: string } | null; tickets?: { name: string; price_minor: number } | null;
};

function Action({ p, action, label }: { p: ParticipantRow; action: string; label: string }) {
  return (
    <form action={participantAction}>
      <input type="hidden" name="id" value={p.id} /><input type="hidden" name="webinar_id" value={p.webinar_id} />
      <input type="hidden" name="action" value={action} />
      <SubmitButton className="block w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50" pendingText="…">{label}</SubmitButton>
    </form>
  );
}

export function ParticipantTable({ rows, tz, showWebinar = false }: { rows: ParticipantRow[]; tz: string; showWebinar?: boolean }) {
  return (
    <div className="card overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Participant</th>{showWebinar && <th>Webinar</th>}<th>WhatsApp</th><th>Registered</th><th>Source</th><th>Ticket</th>
            <th>Status</th><th>Payment</th><th>Confirmation</th><th>Reminder</th><th>Join link</th><th>Attendance</th>
            <th>Join / leave</th><th>Minutes</th><th>Follow-up</th><th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td><p className="font-medium">{p.full_name}</p><p className="text-xs text-slate-500">{p.email} · {p.participant_code}</p></td>
              {showWebinar && <td>{p.webinars?.title}</td>}
              <td>{p.phone || "—"}</td>
              <td className="text-slate-500">{formatDateTime(p.created_at, tz)}</td>
              <td className="capitalize">{p.source}</td>
              <td>{p.tickets?.name || "Free"}</td>
              <td><StatusBadge status={p.status} /></td>
              <td><StatusBadge status={p.payment_status} /></td>
              <td><StatusBadge status={p.confirmation_status} /></td>
              <td><StatusBadge status={p.reminder_status} /></td>
              <td>{p.join_link_clicked ? <Badge tone="blue">Clicked</Badge> : <Badge>No</Badge>}</td>
              <td>{p.attended ? <Badge tone="green">Joined</Badge> : <Badge>Not joined</Badge>}</td>
              <td className="text-xs text-slate-500">{p.join_time ? formatDateTime(p.join_time, tz) : "—"}<br />{p.leave_time ? formatDateTime(p.leave_time, tz) : ""}</td>
              <td>{p.attended_minutes || 0}</td>
              <td><StatusBadge status={p.followup_status} /></td>
              <td>
                <details className="relative">
                  <summary className="btn-ghost btn-sm cursor-pointer list-none">•••</summary>
                  <div className="absolute right-0 z-10 mt-1 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    {p.status === "pending_approval" && <><Action p={p} action="approve" label="Approve" /><Action p={p} action="reject" label="Reject" /></>}
                    {p.status === "confirmed" && <Action p={p} action="resend" label="Resend confirmation" />}
                    {p.attended ? <Action p={p} action="not_attended" label="Mark as not attended" /> : <Action p={p} action="attended" label="Mark as attended" />}
                    {p.status !== "cancelled" && <Action p={p} action="cancel" label="Cancel registration" />}
                  </div>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ParticipantFilters({ sp, sources, extra }: { sp: Record<string, string | undefined>; sources: string[]; extra?: React.ReactNode }) {
  return (
    <form className="mb-4 flex flex-wrap items-end gap-2">
      {extra}
      <input name="q" defaultValue={sp.q} placeholder="Search name, email, phone, ID" className="input w-64" />
      <select name="status" defaultValue={sp.status || ""} className="input w-44">
        <option value="">All statuses</option><option value="confirmed">Confirmed</option><option value="pending_payment">Pending payment</option>
        <option value="pending_approval">Pending approval</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option>
      </select>
      <select name="segment" defaultValue={sp.segment || ""} className="input w-48">
        <option value="">Everyone</option><option value="attended">Attended</option><option value="absent">Did not attend</option>
        <option value="clicked_not_attended">Clicked link, not attended</option><option value="not_clicked">Never clicked link</option>
      </select>
      <select name="source" defaultValue={sp.source || ""} className="input w-36">
        <option value="">All sources</option>{sources.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <button className="btn-secondary">Filter</button>
    </form>
  );
}
