import Link from "next/link";
import { StatusBadge } from "@/components/ui";
import { WebinarTabs } from "@/components/webinars/tabs";
import { APP_URL, formatDateTime } from "@/lib/utils";
import { getWebinar } from "./data";

export default async function WebinarLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { webinar: w } = await getWebinar(id);
  return (
    <>
      <div className="mb-4">
        <Link href="/dashboard/webinars" className="text-xs text-slate-500 hover:text-slate-800">← Webinars</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{w.title}</h1>
          <StatusBadge status={w.status} />
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {formatDateTime(w.starts_at, w.timezone)} ({w.timezone}) · {w.duration_minutes} min ·{" "}
          {w.status === "published" ? <a href={`${APP_URL}/e/${w.slug}`} target="_blank" className="text-brand-600 hover:underline">/e/{w.slug} ↗</a> : <span>/e/{w.slug}</span>}
        </p>
      </div>
      <WebinarTabs id={id} />
      {children}
    </>
  );
}
