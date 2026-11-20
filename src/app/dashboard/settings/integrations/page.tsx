import Link from "next/link";
import { getOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { decryptJson } from "@/lib/crypto";
import { APP_URL } from "@/lib/utils";
import { Badge } from "@/components/ui";
import { CopyField } from "@/components/ui/copy";
import { Flash } from "@/components/ui/flash";
import { ConfirmButton, SubmitButton } from "@/components/ui/submit";
import { disableIntegration, saveIntegration } from "../actions";

export const metadata = { title: "Integrations" };

function Card({ title, connected, children, provider, canRemove }: { title: string; connected: boolean; children: React.ReactNode; provider: string; canRemove: boolean }) {
  return (
    <section className="card-pad space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {connected ? <Badge tone="green">Connected</Badge> : <Badge>Not connected</Badge>}
      </div>
      {children}
      {connected && canRemove && (
        <form action={disableIntegration}><input type="hidden" name="provider" value={provider} />
          <ConfirmButton message={`Remove the ${title} integration?`}>Remove</ConfirmButton></form>
      )}
    </section>
  );
}

export default async function Integrations({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const { data: rows } = await supabase.from("integrations").select("provider, enabled, config, secrets_encrypted").eq("organization_id", ctx.org.id);
  const get = (p: string) => rows?.find((r) => r.provider === p);
  const zoom = get("zoom"), rzp = get("razorpay"), crm = get("crm_webhook");
  const crmSecret = decryptJson<{ signing_secret?: string }>(crm?.secrets_encrypted)?.signing_secret;
  const isAdmin = ctx.role !== "member";
  const events = (crm?.config as any)?.events || ["participant.confirmed", "participant.attended"];

  return (
    <>
      <Flash searchParams={sp} />
      <p className="mb-4 text-sm text-slate-500">WhatsApp (WATI) is configured on the <Link href="/dashboard/whatsapp" className="text-brand-600 underline">WhatsApp page</Link>.</p>
      {!isAdmin && <p className="mb-4 text-sm text-slate-500">Only admins can change integrations.</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Zoom — attendance tracking" connected={!!zoom} provider="zoom" canRemove={isAdmin}>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>In the Zoom App Marketplace, create a <b>General app</b> (or Webhook-only app) and enable Event Subscriptions.</li>
            <li>Add the endpoint URL below and subscribe to <code>meeting.participant_joined</code> and <code>meeting.participant_left</code> (and the <code>webinar.*</code> equivalents if you use Zoom Webinars).</li>
            <li>Copy the app's <b>Secret Token</b> here, save, then press <i>Validate</i> in Zoom.</li>
            <li>Make sure each EventOS webinar has its Zoom meeting ID. Attendees are matched by email — ask them to join signed in, or enable Zoom registration.</li>
          </ol>
          <CopyField label="Event notification endpoint URL" value={`${APP_URL}/api/v1/webhooks/zoom/${ctx.org.id}`} />
          <form action={saveIntegration} className="space-y-2">
            <input type="hidden" name="provider" value="zoom" />
            <input name="secret_token" type="password" className="input" placeholder={zoom ? "•••••• saved — paste to replace" : "Zoom webhook Secret Token"} />
            {isAdmin && <SubmitButton>{zoom ? "Update" : "Connect Zoom"}</SubmitButton>}
          </form>
        </Card>

        <Card title="Google Meet" connected provider="google_meet" canRemove={false}>
          <p className="text-sm text-slate-600">
            Paste the Meet link into a webinar. Each registrant still gets a unique tracked join link, so link clicks are recorded.
            For verified attendance, download the Meet attendance report (Google Workspace) and import it from the webinar's
            <b> Participants</b> tab. Live Meet attendance sync via the Workspace Reports API is planned next.
          </p>
        </Card>

        <Card title="Razorpay — paid registration" connected={!!rzp} provider="razorpay" canRemove={isAdmin}>
          <p className="text-sm text-slate-600">Payments go straight to your Razorpay account. Registrations are confirmed only after the payment signature or webhook is verified.</p>
          {rzp && <p className="text-xs text-slate-500">Mode: <b>{(rzp.config as any)?.mode}</b> · Key ID {(rzp.config as any)?.key_id}</p>}
          <CopyField label="Webhook URL (Razorpay → Settings → Webhooks; events: payment.captured, payment.failed, order.paid)" value={`${APP_URL}/api/v1/webhooks/payments/${ctx.org.id}`} />
          <form action={saveIntegration} className="space-y-2">
            <input type="hidden" name="provider" value="razorpay" />
            <input name="key_id" className="input" placeholder="Key ID (rzp_test_… or rzp_live_…)" defaultValue={(rzp?.config as any)?.key_id} />
            <input name="key_secret" type="password" className="input" placeholder={rzp ? "Key Secret •••••• saved" : "Key Secret"} />
            <input name="webhook_secret" type="password" className="input" placeholder="Webhook secret (you choose it in Razorpay)" />
            {isAdmin && <SubmitButton>{rzp ? "Update" : "Connect Razorpay"}</SubmitButton>}
          </form>
        </Card>

        <Card title="CRM sync (webhook)" connected={!!crm} provider="crm_webhook" canRemove={isAdmin}>
          <p className="text-sm text-slate-600">
            EventOS POSTs signed JSON for each event to your URL — connect it to n8n, Make or Zapier to update Salesforce, LeadSquared, HubSpot or a Google Sheet.
            Verify with header <code>X-EventOS-Signature</code> = HMAC-SHA256(secret, raw body).
          </p>
          <form action={saveIntegration} className="space-y-2">
            <input type="hidden" name="provider" value="crm_webhook" />
            <input name="url" type="url" className="input" defaultValue={(crm?.config as any)?.url} placeholder="https://your-n8n.example.com/webhook/eventos" />
            <div className="flex flex-wrap gap-3 text-sm">
              {["participant.confirmed", "participant.attended"].map((e) => (
                <label key={e} className="flex items-center gap-1.5"><input type="checkbox" name="events" value={e} defaultChecked={events.includes(e)} /> {e}</label>
              ))}
            </div>
            {isAdmin && <SubmitButton>{crm ? "Update" : "Enable CRM webhook"}</SubmitButton>}
          </form>
          {crmSecret && isAdmin && <CopyField label="Signing secret" value={crmSecret} />}
        </Card>

      </div>
    </>
  );
}
