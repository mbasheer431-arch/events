import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicWebinar } from "@/lib/public";
import { BRAND } from "@/lib/brand";
import { APP_URL, formatDate, formatTime, webinarEnd } from "@/lib/utils";
import { Countdown } from "@/components/public/countdown";
import { RegistrationForm } from "@/components/public/registration-form";
import { Share } from "@/components/public/share";
import { PageViewTracker } from "@/components/public/tracker";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const d = await getPublicWebinar(slug);
  if (!d) return { title: "Webinar not found" };
  const desc = d.webinar.short_description || `${formatDate(d.webinar.starts_at, d.webinar.timezone)} · ${formatTime(d.webinar.starts_at, d.webinar.timezone)}`;
  return {
    title: d.webinar.title, description: desc,
    alternates: { canonical: `${APP_URL}/e/${slug}` },
    openGraph: { title: d.webinar.title, description: desc, url: `${APP_URL}/e/${slug}`, type: "website", images: d.webinar.cover_image_url ? [{ url: d.webinar.cover_image_url, width: 1200, height: 630 }] : [] },
    twitter: { card: "summary_large_image", title: d.webinar.title, description: desc },
  };
}

const PLATFORM: Record<string, string> = { zoom: "Zoom", google_meet: "Google Meet", youtube_live: "YouTube Live", custom: "Online" };

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = await getPublicWebinar(slug);
  if (!d) notFound();
  const { webinar: w, org, speakers, form, questions, tickets } = d;
  const ended = webinarEnd(w).getTime() < Date.now() || w.status === "completed";
  const full = !!w.capacity && d.registeredCount >= w.capacity;
  const url = `${APP_URL}/e/${slug}`;
  const jsonLd = {
    "@context": "https://schema.org", "@type": "Event", name: w.title, description: w.short_description || w.description,
    startDate: w.starts_at, endDate: webinarEnd(w).toISOString(), eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled", location: { "@type": "VirtualLocation", url }, image: w.cover_image_url ? [w.cover_image_url] : undefined,
    organizer: { "@type": "Organization", name: org?.name, url: org?.website || undefined },
    offers: tickets.length ? tickets.map((t) => ({ "@type": "Offer", price: t.price_minor / 100, priceCurrency: t.currency, url, availability: "https://schema.org/InStock" }))
      : { "@type": "Offer", price: 0, priceCurrency: "INR", url, availability: "https://schema.org/InStock" },
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white">
      <PageViewTracker webinarId={w.id} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
        <img src={org?.logo_url || BRAND.logo} alt={org?.name || BRAND.name} className="h-10 w-auto" />
      </header>
      <main className="mx-auto grid max-w-6xl gap-8 px-4 pb-16 lg:grid-cols-[1fr_400px]">
        <div className="space-y-8">
          {w.cover_image_url && <img src={w.cover_image_url} alt="" className="aspect-[1200/630] w-full rounded-2xl object-cover shadow-sm" />}
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">{tickets.some((t) => t.price_minor > 0) ? "Online webinar" : "Free online webinar"} · {PLATFORM[w.platform]}</p>
            <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">{w.title}</h1>
            {w.short_description && <p className="mt-3 text-lg text-slate-600">{w.short_description}</p>}
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
                <p className="text-sm font-semibold">{formatDate(w.starts_at, w.timezone)}</p>
                <p className="text-sm text-slate-500">{formatTime(w.starts_at, w.timezone)} · {w.duration_minutes} min · {w.language}</p>
              </div>
              {!ended && <Countdown to={w.starts_at} />}
            </div>
          </div>
          {!!w.learning_outcomes?.length && (
            <section>
              <h2 className="mb-3 text-xl font-semibold">What you'll learn</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {w.learning_outcomes.map((o: string) => <li key={o} className="flex gap-2 rounded-lg bg-white p-3 text-sm shadow-sm"><span className="text-brand-600">✓</span>{o}</li>)}
              </ul>
            </section>
          )}
          {w.description && <section><h2 className="mb-3 text-xl font-semibold">About this webinar</h2><p className="whitespace-pre-line leading-relaxed text-slate-700">{w.description}</p></section>}
          {!!speakers.length && (
            <section>
              <h2 className="mb-3 text-xl font-semibold">{speakers.length > 1 ? "Speakers" : "Speaker"}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {speakers.map((s) => (
                  <div key={s.name} className="flex gap-4 rounded-xl bg-white p-4 shadow-sm">
                    {s.photo_url ? <img src={s.photo_url} alt={s.name} className="h-16 w-16 shrink-0 rounded-full object-cover" />
                      : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xl font-semibold text-brand-700">{s.name[0]}</div>}
                    <div><p className="font-semibold">{s.name}</p>{s.title && <p className="text-sm text-slate-500">{s.title}</p>}{s.bio && <p className="mt-1 text-sm text-slate-600">{s.bio}</p>}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
          {(w.host_name || w.organizer_info) && (
            <section className="rounded-xl bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Hosted by</h2>
              <p className="mt-1 font-semibold">{w.host_name || org?.name}</p>
              {w.host_details && <p className="mt-1 text-sm text-slate-600">{w.host_details}</p>}
              {w.organizer_info && <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{w.organizer_info}</p>}
            </section>
          )}
          <section><h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Share</h2><Share url={url} title={w.title} /></section>
        </div>

        <aside id="register" className="lg:sticky lg:top-6 lg:h-fit">
          <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-100">
            <h2 className="text-lg font-semibold">{ended ? "This webinar has ended" : "Reserve your spot"}</h2>
            {!ended && <p className="mb-4 mt-1 text-sm text-slate-500">You'll get your personal joining link on WhatsApp and email.</p>}
            {ended ? <p className="mt-2 text-sm text-slate-600">Registration is closed. Follow {org?.name} for upcoming sessions.</p> : (
              <RegistrationForm webinarId={w.id} slug={slug} title={w.title} orgName={org?.name || ""}
                fields={(form?.fields as any) || { phone: { enabled: true, required: true } }} questions={questions as any} tickets={tickets as any}
                consentText={form?.consent_text || "I agree to receive webinar updates on WhatsApp and email."}
                submitLabel={form?.submit_label || "Register Now"} inviteRequired={w.registration_type === "invite_only"} full={full} />
            )}
          </div>
        </aside>
      </main>
      <a href="#register" className="btn-primary fixed inset-x-4 bottom-4 py-3 text-base shadow-lg lg:hidden">Register now</a>
      <footer className="pb-20 text-center text-xs text-slate-400 lg:pb-8">Powered by EventOS</footer>
    </div>
  );
}
