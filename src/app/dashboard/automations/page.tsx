import Link from "next/link";
import { getOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { VARIABLES } from "@/lib/templates";
import { formatDateTime } from "@/lib/utils";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";
import { Flash } from "@/components/ui/flash";
import { ConfirmButton, SubmitButton } from "@/components/ui/submit";
import { deleteTemplate, runQueueNow, saveEmailTemplate } from "./actions";

export const metadata = { title: "Automations" };

export default async function Automations({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; edit?: string }> }) {
  const sp = await searchParams;
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const [{ data: webinars }, { data: emailTpls }, { data: upcoming }, { data: failed }] = await Promise.all([
    supabase.from("webinars").select("id, title, starts_at, timezone, status, automation_workflows(enabled)").eq("organization_id", ctx.org.id)
      .gte("starts_at", new Date(Date.now() - 3 * 86400_000).toISOString()).order("starts_at"),
    supabase.from("message_templates").select("*").eq("organization_id", ctx.org.id).eq("channel", "email").order("name"),
    supabase.from("automation_jobs").select("id, run_at, status, automation_workflows(name, webinars(title)), participants(full_name)")
      .eq("organization_id", ctx.org.id).eq("status", "pending").order("run_at").limit(15),
    supabase.from("automation_jobs").select("id, run_at, last_error, automation_workflows(name), participants(full_name)")
      .eq("organization_id", ctx.org.id).eq("status", "failed").order("run_at", { ascending: false }).limit(10),
  ]);
  const editing = emailTpls?.find((t) => t.id === sp.edit);

  return (
    <>
      <PageHeader title="Automations" description="Reminders and follow-ups run from a queue processed every minute."
        actions={<form action={runQueueNow}><SubmitButton className="btn-secondary" pendingText="Running…">Run due jobs now</SubmitButton></form>} />
      <Flash searchParams={sp} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card-pad">
            <h2 className="mb-3 text-sm font-semibold">Webinar workflows</h2>
            {webinars?.length ? (
              <ul className="divide-y divide-slate-100">
                {webinars.map((w) => {
                  const wfs = (w.automation_workflows as any[]) || [];
                  return (
                    <li key={w.id} className="flex items-center justify-between py-2.5 text-sm">
                      <div><p className="font-medium">{w.title}</p><p className="text-xs text-slate-500">{formatDateTime(w.starts_at, w.timezone)} · {wfs.filter((x) => x.enabled).length}/{wfs.length} workflows on</p></div>
                      <Link className="btn-secondary btn-sm" href={`/dashboard/webinars/${w.id}/automations`}>Configure</Link>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-sm text-slate-500">No current webinars.</p>}
          </div>
          <div className="card overflow-x-auto">
            <div className="px-5 pt-4 text-sm font-semibold">Next in queue</div>
            {upcoming?.length ? (
              <table className="table mt-2"><thead><tr><th>Runs</th><th>Workflow</th><th>Participant</th><th>Status</th></tr></thead>
                <tbody>{upcoming.map((j) => (
                  <tr key={j.id}><td>{formatDateTime(j.run_at, ctx.org.timezone)}</td>
                    <td>{(j.automation_workflows as any)?.name}<p className="text-xs text-slate-500">{(j.automation_workflows as any)?.webinars?.title}</p></td>
                    <td>{(j.participants as any)?.full_name}</td><td><StatusBadge status={j.status} /></td></tr>
                ))}</tbody></table>
            ) : <p className="px-5 pb-4 pt-2 text-sm text-slate-500">Queue is empty.</p>}
          </div>
          {!!failed?.length && (
            <div className="card overflow-x-auto">
              <div className="px-5 pt-4 text-sm font-semibold text-red-700">Recent failures</div>
              <table className="table mt-2"><thead><tr><th>When</th><th>Workflow</th><th>Participant</th><th>Error</th></tr></thead>
                <tbody>{failed.map((j) => (
                  <tr key={j.id}><td>{formatDateTime(j.run_at, ctx.org.timezone)}</td><td>{(j.automation_workflows as any)?.name}</td>
                    <td>{(j.participants as any)?.full_name}</td><td className="max-w-sm truncate text-xs text-red-600" title={j.last_error || ""}>{j.last_error}</td></tr>
                ))}</tbody></table>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <form action={saveEmailTemplate} className="card-pad space-y-3">
            <h2 className="text-sm font-semibold">{editing ? "Edit email template" : "New email template"}</h2>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <input name="name" required defaultValue={editing?.name} className="input" placeholder="Template name" />
            <input name="subject" required defaultValue={editing?.subject || ""} className="input" placeholder="Subject — e.g. Your replay: {{webinar_title}}" />
            <textarea name="body" required rows={8} defaultValue={editing?.body || ""} className="input font-mono text-xs" placeholder={"Hi {{first_name}},\n\n…"} />
            <p className="hint">Variables: {VARIABLES.map((v) => `{{${v.key}}}`).join(" ")}</p>
            <div className="flex gap-2"><SubmitButton>Save template</SubmitButton>{editing && <Link href="/dashboard/automations" className="btn-ghost">Cancel</Link>}</div>
          </form>
          <div className="card-pad">
            <h2 className="mb-2 text-sm font-semibold">Email templates</h2>
            {emailTpls?.length ? (
              <ul className="divide-y divide-slate-100">
                {emailTpls.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                    <Link href={`?edit=${t.id}`} className="hover:underline">{t.name}</Link>
                    <form action={deleteTemplate}><input type="hidden" name="id" value={t.id} />
                      <ConfirmButton message="Delete this template?" className="btn-ghost btn-sm text-red-600">Delete</ConfirmButton></form>
                  </li>
                ))}
              </ul>
            ) : <Empty title="No custom email templates" description="Built-in copy is used until you add one." />}
          </div>
        </div>
      </div>
    </>
  );
}
