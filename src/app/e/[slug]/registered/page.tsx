import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicWebinar } from "@/lib/public";
import { BRAND } from "@/lib/brand";
import { APP_URL, formatDate, formatTime, webinarEnd } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "You're registered", robots: { index: false } };

function gcal(w: { title: string; starts_at: string; duration_minutes: number; short_description?: string | null }, url: string) {
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const p = new URLSearchParams({ action: "TEMPLATE", text: w.title, dates: `${f(new Date(w.starts_at))}/${f(webinarEnd(w))}`, details: `${w.short_description || ""}\n\nYour personal join link: ${url}` });
  return `https://calendar.google.com/calendar/render?${p}`;
}

export default async function Registered({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ code?: string; dup?: string }> }) {
  const { slug } = await params;
  const { code, dup } = await searchParams;
  const d = await getPublicWebinar(slug);
  if (!d || !code) notFound();
  const db = createAdminClient();
  const { data: p } = await db.from("participants").select("full_name, status, participant_code, webinar_join_links(token)").eq("participant_code", code).eq("webinar_id", d.webinar.id).maybeSingle();
  if (!p) notFound();
  const w = d.webinar;
  const token = (Array.isArray(p.webinar_join_links) ? p.webinar_join_links[0] : (p.webinar_join_links as any))?.token;
  const joinUrl = token ? `${APP_URL}/j/${token}` : "";
  const first = p.full_name.split(" ")[0];
  const msg = {
    confirmed: d.form?.success_message || "You're registered! Check WhatsApp and email for details.",
    pending_approval: "Thanks! Your registration is awaiting approval. We'll message you once it's confirmed.",
    pending_payment: "Your payment is being confirmed. You'll receive a message as soon as it's done.",
  }[p.status as string] || "Your registration has been received.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-white px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 text-center shadow-lg">
        <img src={BRAND.logo} alt={BRAND.name} className="mx-auto mb-6 h-10 w-auto" />
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">✓</div>
        <h1 className="text-2xl font-bold">{dup ? `You're already registered, ${first}` : `Thanks, ${first}!`}</h1>
        <p className="mt-2 text-slate-600">{msg}</p>
        <div className="mt-6 rounded-xl bg-slate-50 p-4 text-left text-sm">
          <p className="font-semibold">{w.title}</p>
          <p className="text-slate-600">{formatDate(w.starts_at, w.timezone)} · {formatTime(w.starts_at, w.timezone)}</p>
          <p className="mt-2 text-xs text-slate-500">Participant ID: <span className="font-mono">{p.participant_code}</span></p>
        </div>
        {p.status === "confirmed" && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <a className="btn-primary" target="_blank" rel="noopener" href={gcal(w, joinUrl)}>Add to Google Calendar</a>
            <a className="btn-secondary" href={`/api/v1/webinars/${w.id}/ics?code=${p.participant_code}`}>Download .ics</a>
          </div>
        )}
        <Link href={`/e/${slug}`} className="mt-6 inline-block text-sm text-brand-600">← Back to webinar page</Link>
      </div>
    </div>
  );
}
