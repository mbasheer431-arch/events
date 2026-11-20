import Link from "next/link";
import { getFunnel } from "@/lib/analytics";
import { Stat } from "@/components/ui";
import { CopyField } from "@/components/ui/copy";
import { Flash } from "@/components/ui/flash";
import { ConfirmButton, SubmitButton } from "@/components/ui/submit";
import { APP_URL, formatMoney } from "@/lib/utils";
import { deleteWebinar, duplicateWebinar, setWebinarStatus } from "../actions";
import { getWebinar } from "./data";

export default async function WebinarOverview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { webinar: w, ctx, supabase } = await getWebinar(id);
  const [funnel, { data: wati }, { data: zoom }, { data: wfs }] = await Promise.all([
    getFunnel(supabase, ctx.org.id, id),
    supabase.from("wati_connections").select("status").eq("organization_id", ctx.org.id).maybeSingle(),
    supabase.from("integrations").select("enabled").eq("organization_id", ctx.org.id).eq("provider", "zoom").maybeSingle(),
    supabase.from("automation_workflows").select("enabled, send_whatsapp, whatsapp_template_id").eq("webinar_id", id),
  ]);
  const url = `${APP_URL}/e/${w.slug}`;
  const needsWaTemplates = (wfs || []).filter((x) => x.enabled && x.send_whatsapp && !x.whatsapp_template_id).length;
  const checklist = [
    { ok: !!w.meeting_url, label: "Meeting / streaming link added", href: "settings" },
    { ok: wati?.status === "connected", label: "WATI WhatsApp connected", href: "/dashboard/whatsapp" },
    { ok: needsWaTemplates === 0, label: needsWaTemplates ? `${needsWaTemplates} automations still need a WhatsApp template` : "WhatsApp templates mapped", href: "automations" },
    ...(w.platform === "zoom" ? [{ ok: !!zoom?.enabled && !!w.meeting_id, label: "Zoom attendance tracking (webhook + meeting ID)", href: "/dashboard/settings/integrations" }] : []),
    ...(w.registration_type === "invite_only" ? [{ ok: !!w.invite_code, label: "Invite code set", href: "settings" }] : []),
  ];
  const go = (h: string) => (h.startsWith("/") ? h : `/dashboard/webinars/${id}/${h}`);

  return (
    <>
      <Flash searchParams={sp} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Page views" value={funnel.pageViews} sub={`${funnel.uniqueVisitors} unique`} />
        <Stat label="Registrations" value={funnel.registrations} sub={`${funnel.conversionRate}% conversion`} />
        <Stat label="Clicked join link" value={funnel.clicked} sub={`${funnel.clickRate}% of confirmed`} />
        <Stat label="Attended" value={funnel.attended} sub={`${funnel.attendanceRate}% · avg ${funnel.avgMinutes} min`} />
        <Stat label="Revenue" value={formatMoney(funnel.paidRevenueMinor)} sub="Paid orders" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card-pad space-y-4 lg:col-span-2">
          <h2 className="text-sm font-semibold">Share your registration page</h2>
          <CopyField value={w.registration_type === "invite_only" && w.invite_code ? `${url}?invite=${w.invite_code}` : url} label="Registration link" />
          <div className="grid gap-3 sm:grid-cols-3">
            <CopyField label="Meta ads" value={`${url}?utm_source=facebook&utm_medium=paid&utm_campaign=${w.slug}`} />
            <CopyField label="Google ads" value={`${url}?utm_source=google&utm_medium=cpc&utm_campaign=${w.slug}`} />
            <CopyField label="WhatsApp" value={`${url}?utm_source=whatsapp&utm_medium=broadcast&utm_campaign=${w.slug}`} />
          </div>
          <p className="hint">Sources are detected from UTM tags and fbclid / gclid automatically.</p>
        </div>
        <div className="card-pad">
          <h2 className="mb-3 text-sm font-semibold">Launch checklist</h2>
          <ul className="space-y-2 text-sm">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-start gap-2">
                <span className={c.ok ? "text-emerald-600" : "text-amber-500"}>{c.ok ? "✓" : "!"}</span>
                {c.ok ? <span>{c.label}</span> : <Link href={go(c.href)} className="text-slate-700 underline decoration-dotted">{c.label}</Link>}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card-pad mt-6 flex flex-wrap items-center gap-2">
        {w.status !== "published" && w.status !== "cancelled" && (
          <form action={setWebinarStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="published" /><SubmitButton pendingText="Publishing…">Publish registration page</SubmitButton></form>
        )}
        {w.status === "published" && (
          <>
            <form action={setWebinarStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="draft" /><SubmitButton className="btn-secondary">Unpublish</SubmitButton></form>
            <form action={setWebinarStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="completed" /><SubmitButton className="btn-secondary">Mark completed</SubmitButton></form>
          </>
        )}
        <form action={duplicateWebinar}><input type="hidden" name="id" value={id} /><SubmitButton className="btn-secondary" pendingText="Duplicating…">Duplicate</SubmitButton></form>
        <div className="ml-auto flex gap-2">
          {w.status !== "cancelled" && (
            <form action={setWebinarStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="cancelled" />
              <ConfirmButton message="Cancel this webinar? Pending reminders will stop.">Cancel webinar</ConfirmButton></form>
          )}
          <form action={deleteWebinar}><input type="hidden" name="id" value={id} />
            <ConfirmButton message="Delete this webinar and all its registrations permanently?">Delete</ConfirmButton></form>
        </div>
      </div>
    </>
  );
}
