import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL, webinarEnd } from "@/lib/utils";

const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const code = req.nextUrl.searchParams.get("code");
  const db = createAdminClient();
  const { data: w } = await db.from("webinars").select("id, slug, title, short_description, starts_at, duration_minutes").eq("id", id).maybeSingle();
  if (!w) return new NextResponse("Not found", { status: 404 });
  let url = `${APP_URL}/e/${w.slug}`;
  if (code) {
    const { data: p } = await db.from("participants").select("webinar_join_links(token)").eq("participant_code", code).eq("webinar_id", id).eq("status", "confirmed").maybeSingle();
    const token = (Array.isArray(p?.webinar_join_links) ? p?.webinar_join_links[0] : (p?.webinar_join_links as any))?.token;
    if (token) url = `${APP_URL}/j/${token}`;
  }
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//EventOS//Webinar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${w.id}-${code || "public"}@eventos`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(new Date(w.starts_at))}`, `DTEND:${f(webinarEnd(w))}`,
    `SUMMARY:${esc(w.title)}`, `DESCRIPTION:${esc(`${w.short_description || ""}\n\nJoin: ${url}`)}`, `URL:${url}`, `LOCATION:${esc(url)}`,
    "BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", "DESCRIPTION:Webinar starting soon", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return new NextResponse(ics, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="${w.slug}.ics"` } });
}
