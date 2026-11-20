import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicWebinar } from "@/lib/public";
import { BRAND } from "@/lib/brand";
import { formatDate, formatTime } from "@/lib/utils";
import { Countdown } from "@/components/public/countdown";

export const dynamic = "force-dynamic";
export const metadata = { title: "Webinar access", robots: { index: false } };

const MESSAGES: Record<string, string> = {
  early: "You're early! The session opens 15 minutes before the start time.",
  nolink: "The organizer hasn't shared the session link yet. Please check back closer to the start time.",
  ended: "This webinar has ended. A replay link will be shared with you if available.",
  cancelled: "This webinar has been cancelled.",
  unconfirmed: "Your registration isn't confirmed yet, so this link isn't active.",
};

export default async function Waiting({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string; r?: string }> }) {
  const { slug } = await params;
  const { t, r = "early" } = await searchParams;
  const d = await getPublicWebinar(slug);
  if (!d) notFound();
  const w = d.webinar;
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-white px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <img src={d.org?.logo_url || BRAND.logo} alt={d.org?.name || BRAND.name} className="mx-auto h-10 w-auto" />
        <h1 className="mt-2 text-2xl font-bold">{w.title}</h1>
        <p className="mt-1 text-slate-600">{formatDate(w.starts_at, w.timezone)} · {formatTime(w.starts_at, w.timezone)}</p>
        <p className="mt-6 text-slate-700">{MESSAGES[r] || MESSAGES.early}</p>
        {r === "early" && <div className="mt-5 flex justify-center"><Countdown to={w.starts_at} /></div>}
        {r === "early" && t && <a href={`/j/${t}?go=1`} className="btn-secondary mt-6">Join anyway</a>}
        {r === "nolink" && t && <a href={`/j/${t}`} className="btn-primary mt-6">Try again</a>}
        <div className="mt-6"><Link href={`/e/${slug}`} className="text-sm text-brand-600">Webinar details</Link></div>
      </div>
    </div>
  );
}
