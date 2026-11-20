import { getOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { getWatiConfig } from "@/lib/messaging";
import { watiListTemplates, type WatiTemplate } from "@/lib/providers/wati";
import { VARIABLES } from "@/lib/templates";
import { APP_URL, formatDateTime } from "@/lib/utils";
import { Badge, PageHeader, StatusBadge } from "@/components/ui";
import { CopyField } from "@/components/ui/copy";
import { Flash } from "@/components/ui/flash";
import { ConfirmButton, SubmitButton } from "@/components/ui/submit";
import { deleteTemplate } from "../automations/actions";
import { connectWati, disconnectWati, saveWhatsappTemplate, sendWatiTest } from "./actions";

export const metadata = { title: "WhatsApp" };

function MappingForm({ t, existing }: { t: WatiTemplate; existing?: any }) {
  const current = new Map<string, any>((existing?.variable_mapping || []).map((m: any) => [m.param, m]));
  return (
    <form action={saveWhatsappTemplate} className="space-y-2 rounded-lg bg-slate-50 p-3">
      {existing && <input type="hidden" name="id" value={existing.id} />}
      <input type="hidden" name="wati_template_name" value={t.name} />
      <input type="hidden" name="params" value={t.params.join(",")} />
      <input type="hidden" name="body" value={t.body} />
      <input name="name" defaultValue={existing?.name || t.name} className="input" placeholder="Display name in EventOS" />
      {t.params.map((p) => (
        <div key={p} className="flex items-center gap-2 text-sm">
          <code className="w-28 shrink-0 truncate rounded bg-white px-2 py-1 text-xs">{`{{${p}}}`}</code>
          <select name={`map_${p}`} defaultValue={current.get(p)?.variable || (VARIABLES.some((v) => v.key === p) ? p : "name")} className="input">
            {VARIABLES.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
            <option value="static">Fixed text…</option>
          </select>
          <input name={`static_${p}`} defaultValue={current.get(p)?.static} className="input w-32" placeholder="Fixed text" />
        </div>
      ))}
      {!t.params.length && <p className="text-xs text-slate-500">This template has no variables.</p>}
      <SubmitButton className="btn-secondary btn-sm">{existing ? "Update mapping" : "Use in EventOS"}</SubmitButton>
    </form>
  );
}

export default async function WhatsAppPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const [{ data: conn }, { data: mapped }, { data: logs }] = await Promise.all([
    supabase.from("wati_connections").select("api_base_url, tenant_id, channel_number, status, webhook_secret, last_verified_at").eq("organization_id", ctx.org.id).maybeSingle(),
    supabase.from("message_templates").select("*").eq("organization_id", ctx.org.id).eq("channel", "whatsapp").order("name"),
    supabase.from("message_logs").select("id, recipient, template_name, status, error, created_at, participants(full_name)").eq("organization_id", ctx.org.id).eq("channel", "whatsapp").order("created_at", { ascending: false }).limit(50),
  ]);

  let templates: WatiTemplate[] = [];
  let tplError: string | null = null;
  if (conn) {
    try { const cfg = await getWatiConfig(supabase, ctx.org.id); if (cfg) templates = await watiListTemplates(cfg); }
    catch (e: any) { tplError = e.message; }
  }
  const approved = templates.filter((t) => !t.status || t.status === "APPROVED");
  const webhookUrl = conn ? `${APP_URL}/api/v1/wati/webhook?org=${ctx.org.id}&secret=${conn.webhook_secret}` : "";
  const isAdmin = ctx.role !== "member";

  return (
    <>
      <PageHeader title="WhatsApp" description="WATI is the delivery layer; EventOS owns the workflows and participant data." />
      <Flash searchParams={sp} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <form action={connectWati} className="card-pad space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">WATI connection</h2>
              {conn ? <Badge tone="green">Connected</Badge> : <Badge>Not connected</Badge>}
            </div>
            <label className="block"><span className="label">API endpoint</span>
              <input name="api_base_url" defaultValue={conn ? `${conn.api_base_url}${conn.tenant_id ? `/${conn.tenant_id}` : ""}` : ""} placeholder="https://live-mt-server.wati.io/10152083" className="input" />
              <span className="hint block">Paste it exactly as WATI → Connectors → API shows it (e.g. https://live-mt-server.wati.io/10152083). The tenant ID is picked up automatically.</span></label>
            <label className="block"><span className="label">API token</span>
              <input name="access_token" type="password" className="input" placeholder={conn ? "•••••• saved — paste to replace" : "Bearer token"} />
              <span className="hint block">Create a token with messagetemplatev3 read + write scopes. Stored encrypted.</span></label>
            <label className="block"><span className="label">WhatsApp number</span>
              <input name="channel_number" defaultValue={conn?.channel_number} required className="input" placeholder="919876543210" /></label>
            <label className="block"><span className="label">Tenant ID (optional)</span>
              <input name="tenant_id" defaultValue={conn?.tenant_id || ""} className="input" placeholder="Auto-detected from the endpoint" /></label>
            {isAdmin ? <SubmitButton pendingText="Verifying…">{conn ? "Update connection" : "Connect WATI"}</SubmitButton> : <p className="hint">Only admins can change this.</p>}
          </form>
          {conn && (
            <div className="card-pad space-y-3">
              <h2 className="text-sm font-semibold">Delivery webhook</h2>
              <p className="hint">In WATI → Webhooks, add this URL and enable: Template Message Sent, Delivered, Read, Replied, Failed. API success is never treated as delivery.</p>
              <CopyField value={webhookUrl} />
              {isAdmin && <form action={disconnectWati}><ConfirmButton message="Disconnect WATI? Automations will stop sending WhatsApp.">Disconnect</ConfirmButton></form>}
            </div>
          )}
          {conn && !!mapped?.length && (
            <form action={sendWatiTest} className="card-pad space-y-3">
              <h2 className="text-sm font-semibold">Send a test</h2>
              <select name="template_id" className="input">{mapped.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              <input name="to" className="input" placeholder="Your number, e.g. 919876543210" />
              <SubmitButton className="btn-secondary" pendingText="Sending…">Send test</SubmitButton>
            </form>
          )}
        </div>

        <div className="space-y-6 lg:col-span-2">
          <div className="card-pad">
            <h2 className="text-sm font-semibold">Templates in EventOS</h2>
            <p className="hint mb-3">Mapped templates can be chosen in every webinar's Automations tab and in follow-up campaigns.</p>
            {mapped?.length ? (
              <ul className="divide-y divide-slate-100">
                {mapped.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                    <div><p className="font-medium">{t.name}</p><p className="text-xs text-slate-500">{t.wati_template_name} · {(t.variable_mapping || []).map((m: any) => `{{${m.param}}}→${m.variable}`).join(", ") || "no variables"}</p></div>
                    <form action={deleteTemplate}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="back" value="/dashboard/whatsapp" />
                      <ConfirmButton message="Remove this template from EventOS?" className="btn-ghost btn-sm text-red-600">Remove</ConfirmButton></form>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">None yet — map an approved template below.</p>}
          </div>

          {conn && (
            <div className="card-pad">
              <h2 className="mb-1 text-sm font-semibold">Approved templates in WATI</h2>
              <p className="hint mb-3">Map each {"{{variable}}"} to registration data. Suggested: registration confirmation, 1-hour reminder, missed-webinar replay.</p>
              {tplError && <p className="mb-3 text-sm text-red-600">{tplError}</p>}
              <div className="grid gap-4 md:grid-cols-2">
                {approved.map((t) => (
                  <div key={t.name} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-sm font-medium">{t.name} {t.language && <span className="text-xs text-slate-400">· {t.language}</span>}</p>
                    <p className="my-2 line-clamp-4 whitespace-pre-line text-xs text-slate-600">{t.body}</p>
                    <MappingForm t={t} existing={mapped?.find((m) => m.wati_template_name === t.name)} />
                  </div>
                ))}
                {!approved.length && !tplError && <p className="text-sm text-slate-500">No approved templates returned. Create and get templates approved in WATI first.</p>}
              </div>
            </div>
          )}

          <div className="card overflow-x-auto">
            <div className="px-5 pt-4 text-sm font-semibold">Recent WhatsApp messages</div>
            <table className="table mt-2"><thead><tr><th>When</th><th>To</th><th>Template</th><th>Status</th></tr></thead>
              <tbody>{(logs || []).map((l) => (
                <tr key={l.id}><td className="text-slate-500">{formatDateTime(l.created_at, ctx.org.timezone)}</td>
                  <td>{(l.participants as any)?.full_name} <span className="text-xs text-slate-500">{l.recipient}</span></td>
                  <td>{l.template_name}</td>
                  <td><StatusBadge status={l.status} />{l.error && <span className="ml-2 text-xs text-red-600">{l.error}</span>}</td></tr>
              ))}</tbody></table>
          </div>
        </div>
      </div>
    </>
  );
}
