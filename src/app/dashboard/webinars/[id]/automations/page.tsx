import Link from "next/link";
import { Badge, StatusBadge } from "@/components/ui";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/submit";
import { runAtFor } from "@/lib/automation";
import { formatDateTime } from "@/lib/utils";
import { updateWorkflow } from "../../../automations/actions";
import { getWebinar } from "../data";

function splitOffset(m: number) {
  if (m && m % 1440 === 0) return { value: m / 1440, unit: 1440 };
  if (m && m % 60 === 0) return { value: m / 60, unit: 60 };
  return { value: m, unit: 1 };
}
const TRIGGER_LABEL: Record<string, string> = {
  registration_confirmed: "Immediately after registration is confirmed",
  before_start: "before the webinar starts", at_start: "after the webinar starts", after_end: "after the webinar ends",
};

export default async function WebinarAutomations({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { webinar: w, ctx, supabase } = await getWebinar(id);
  const [{ data: wfs }, { data: tpls }, { data: jobs }] = await Promise.all([
    supabase.from("automation_workflows").select("*").eq("webinar_id", id).order("position"),
    supabase.from("message_templates").select("id, name, channel, wati_template_name").eq("organization_id", ctx.org.id).order("name"),
    supabase.from("automation_jobs").select("workflow_id, status, automation_workflows!inner(webinar_id)").eq("automation_workflows.webinar_id", id).limit(20000),
  ]);
  const wa = (tpls || []).filter((t) => t.channel === "whatsapp");
  const em = (tpls || []).filter((t) => t.channel === "email");
  const counts = (wfId: string) => {
    const js = (jobs || []).filter((j) => j.workflow_id === wfId);
    return { pending: js.filter((j) => j.status === "pending").length, done: js.filter((j) => j.status === "done").length, skipped: js.filter((j) => j.status === "skipped").length, failed: js.filter((j) => j.status === "failed").length };
  };

  return (
    <>
      <Flash searchParams={sp} />
      <div className="mb-4 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-800">
        Prebuilt workflows with configurable timing. WhatsApp needs an approved WATI template mapped on the{" "}
        <Link href="/dashboard/whatsapp" className="underline">WhatsApp page</Link>; email falls back to built-in copy when no template is chosen
        (<Link href="/dashboard/automations" className="underline">manage email templates</Link>).
      </div>
      <div className="space-y-3">
        {(wfs || []).map((wf) => {
          const o = splitOffset(wf.offset_minutes);
          const at = runAtFor(wf, w);
          const c = counts(wf.id);
          return (
            <form key={wf.id} action={updateWorkflow} className="card-pad">
              <input type="hidden" name="id" value={wf.id} /><input type="hidden" name="webinar_id" value={id} /><input type="hidden" name="trigger" value={wf.trigger} />
              <div className="flex flex-wrap items-start justify-between gap-3">
                <label className="flex items-center gap-3">
                  <input type="checkbox" name="enabled" defaultChecked={wf.enabled} className="h-4 w-4" />
                  <span><span className="font-medium">{wf.name}</span>
                    <span className="block text-xs text-slate-500">{at ? `Runs ${formatDateTime(at, w.timezone)}` : TRIGGER_LABEL.registration_confirmed}</span></span>
                </label>
                <div className="flex gap-1 text-xs">
                  {c.pending > 0 && <Badge tone="amber">{c.pending} queued</Badge>}
                  {c.done > 0 && <Badge tone="green">{c.done} sent</Badge>}
                  {c.skipped > 0 && <Badge>{c.skipped} skipped</Badge>}
                  {c.failed > 0 && <Badge tone="red">{c.failed} failed</Badge>}
                </div>
              </div>
              <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
                {wf.trigger !== "registration_confirmed" ? (
                  <div className="flex items-center gap-2 md:col-span-2">
                    <input name="offset_value" type="number" min={0} defaultValue={o.value} className="input w-20" />
                    <select name="offset_unit" defaultValue={o.unit} className="input w-28"><option value={1}>minutes</option><option value={60}>hours</option><option value={1440}>days</option></select>
                    <span className="text-slate-500">{TRIGGER_LABEL[wf.trigger]}</span>
                  </div>
                ) : <p className="text-slate-500 md:col-span-2">{TRIGGER_LABEL.registration_confirmed}</p>}
                <select name="segment" defaultValue={wf.segment} className="input" disabled={wf.trigger !== "after_end"}>
                  <option value="all">Everyone confirmed</option><option value="attended">Attended</option>
                  <option value="absent">Did not attend</option><option value="clicked_not_attended">Clicked, not attended</option>
                </select>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5"><input type="checkbox" name="send_whatsapp" defaultChecked={wf.send_whatsapp} /> WhatsApp</label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" name="send_email" defaultChecked={wf.send_email} /> Email</label>
                </div>
                <select name="whatsapp_template_id" defaultValue={wf.whatsapp_template_id || ""} className="input md:col-span-2">
                  <option value="">— WhatsApp template (required for WhatsApp) —</option>
                  {wa.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.wati_template_name})</option>)}
                </select>
                <select name="email_template_id" defaultValue={wf.email_template_id || ""} className="input md:col-span-2">
                  <option value="">Built-in email copy</option>
                  {em.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="mt-3 flex items-center justify-between">
                {wf.send_whatsapp && !wf.whatsapp_template_id && wf.enabled ? <span className="text-xs text-amber-600">No WhatsApp template selected — only email will go out.</span> : <span />}
                <SubmitButton className="btn-secondary btn-sm">Save</SubmitButton>
              </div>
            </form>
          );
        })}
      </div>
      {w.status === "draft" && <p className="mt-4 text-xs text-slate-500">Jobs are queued per participant when they register. <StatusBadge status="draft" /> webinars don't accept registrations yet.</p>}
    </>
  );
}
