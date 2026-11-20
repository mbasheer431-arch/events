import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

const features = [
  ["Create", "Webinar wizard with speakers, schedule, Zoom / Meet / YouTube links and capacity."],
  ["Register", "Mobile-first landing pages built for Meta and Google ad traffic. Free, paid, approval or invite-only."],
  ["Track", "Unique join link per attendee. Link clicks and verified Zoom attendance kept separate."],
  ["Follow up", "WATI WhatsApp + email reminders, thank-yous and replay nudges on autopilot."],
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <BrandLogo className="h-11" />
        <div className="flex gap-2"><Link href="/login" className="btn-ghost">Sign in</Link><Link href="/signup" className="btn-primary">Start free</Link></div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-12">
        <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">AIMER webinars that fill up, show up and follow up.</h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">Create a webinar, publish a registration page, track real attendance and follow up automatically on WhatsApp and email.</p>
        <div className="mt-8 flex gap-3"><Link href="/signup" className="btn-primary px-6 py-3 text-base">Create your first webinar</Link></div>
        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(([t, d], i) => (
            <div key={t} className="card-pad">
              <p className="text-xs font-semibold text-brand-600">0{i + 1}</p>
              <h3 className="mt-1 text-lg font-semibold">{t}</h3>
              <p className="mt-1 text-sm text-slate-600">{d}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
