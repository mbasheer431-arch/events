import { Empty, StatusBadge } from "@/components/ui";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/submit";
import { formatDateTime } from "@/lib/utils";
import { sendCampaign } from "../../../automations/actions";
import { getWebinar } from "../data";

export default async function WebinarMessages({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; channel?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { webinar: w, ctx, supabase } = await getWebinar(id);
  let logsQ = supabase.from("message_logs").select("id, channel, recipient, template_name, subject, status, error, created_at, participants(full_name)")
    .eq("webinar_id", id).order("created_at", { ascending: false }).limit(200);
  if (sp.channel) logsQ = logsQ.eq("channel", sp.channel);
  const [{ data: logs }, { data: campaigns }, { data: tpls }] = await Promise.all([
    logsQ,
    supabase.from("campaigns").select("*").eq("webinar_id", id).order("created_at", { ascending: false }),
    supabase.from("message_templates").select("id, name, channel").eq("organization_id", ctx.org.id).order("name"),
  ]);

  return (
    <>
      <Flash searchParams={sp} />
      <div className="grid gap-6 lg:grid-cols-3">
        <form action={sendCampaign} className="card-pad space-y-3 h-fit">
          <input type="hidden" name="webinar_id" value={id} />
          <h2 className="text-sm font-semibold">Send a follow-up</h2>
          <p className="hint -mt-2">One-off message to a segment — e.g. replay to absentees, offer to attendees.</p>
          <input name="name" className="input" placeholder="Campaign name" required />
          <select name="segment" className="input" defaultValue="absent">
            <option value="all">All confirmed participants</option><option value="attended">Attended</option>
            <option value="absent">Did not attend</option><option value="clicked_not_attended">Clicked link, not attended</option>
          </select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="send_whatsapp" /> WhatsApp</label>
          <select name="whatsapp_template_id" className="input"><option value="">— WhatsApp template —</option>
            {(tpls || []).filter((t) => t.channel === "whatsapp").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="send_email" defaultChecked /> Email</label>
          <select name="email_template_id" className="input" required><option value="">— Email template —</option>
            {(tpls || []).filter((t) => t.channel === "email").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <SubmitButton pendingText="Sending…">Send now</SubmitButton>
        </form>

        <div className="space-y-6 lg:col-span-2">
          {!!campaigns?.length && (
            <div className="card overflow-x-auto">
              <table className="table"><thead><tr><th>Campaign</th><th>Segment</th><th>Recipients</th><th>Status</th><th>Sent</th></tr></thead>
                <tbody>{campaigns.map((c) => (
                  <tr key={c.id}><td className="font-medium">{c.name}</td><td>{c.segment}</td><td>{c.recipients_count}</td><td><StatusBadge status={c.status} /></td><td>{formatDateTime(c.sent_at, w.timezone)}</td></tr>
                ))}</tbody></table>
            </div>
          )}
          <div>
            <div className="mb-2 flex gap-2 text-sm">
              {[["", "All"], ["whatsapp", "WhatsApp"], ["email", "Email"]].map(([k, l]) => (
                <a key={k} href={k ? `?channel=${k}` : "?"} className={(sp.channel || "") === k ? "btn-secondary btn-sm" : "btn-ghost btn-sm"}>{l}</a>
              ))}
            </div>
            {logs?.length ? (
              <div className="card overflow-x-auto">
                <table className="table"><thead><tr><th>When</th><th>To</th><th>Channel</th><th>Message</th><th>Status</th></tr></thead>
                  <tbody>{logs.map((l) => (
                    <tr key={l.id}>
                      <td className="text-slate-500">{formatDateTime(l.created_at, w.timezone)}</td>
                      <td><p>{(l.participants as any)?.full_name}</p><p className="text-xs text-slate-500">{l.recipient}</p></td>
                      <td className="capitalize">{l.channel}</td>
                      <td className="max-w-xs truncate">{l.subject || l.template_name}</td>
                      <td><StatusBadge status={l.status} />{l.error && <p className="max-w-xs truncate text-xs text-red-600" title={l.error}>{l.error}</p>}</td>
                    </tr>
                  ))}</tbody></table>
              </div>
            ) : <Empty title="No messages yet" description="Confirmations and reminders appear here as they go out." />}
          </div>
        </div>
      </div>
    </>
  );
}
