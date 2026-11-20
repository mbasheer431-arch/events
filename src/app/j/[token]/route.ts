import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL, webinarEnd } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Link-preview crawlers (WhatsApp, Telegram, Slack…) fetch URLs when a message is delivered.
// They must never count as a participant click.
const BOT = /bot|crawler|spider|preview|whatsapp|facebookexternalhit|facebot|telegram|slack|discord|linkedin|twitter|skype|embedly|quora|pinterest|vkshare|w3c_validator|curl|wget|python-requests|headless/i;

const EARLY_MINUTES = 15;

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createAdminClient();
  const { data: link } = await db.from("webinar_join_links")
    .select("id, organization_id, participant_id, click_count, first_clicked_at, participants(status), webinars(id, slug, title, starts_at, duration_minutes, meeting_url, replay_url, status)")
    .eq("token", token).maybeSingle();
  if (!link) return NextResponse.redirect(new URL("/", APP_URL));
  const w = link.webinars as any;
  const p = link.participants as any;
  const ua = req.headers.get("user-agent") || "";

  if (BOT.test(ua)) {
    return new NextResponse(`<!doctype html><html><head><meta property="og:title" content="Join: ${w.title.replace(/"/g, "&quot;")}"><meta name="robots" content="noindex"></head><body></body></html>`,
      { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  const now = new Date();
  const go = req.nextUrl.searchParams.get("go") === "1";
  const ended = now.getTime() > webinarEnd(w).getTime() + 30 * 60_000;
  const early = new Date(w.starts_at).getTime() - now.getTime() > EARLY_MINUTES * 60_000;

  // record the click (separately from real attendance)
  if (p?.status === "confirmed") {
    const iso = now.toISOString();
    await Promise.all([
      db.from("webinar_join_links").update({ click_count: link.click_count + 1, last_clicked_at: iso, first_clicked_at: link.first_clicked_at || iso }).eq("id", link.id),
      db.from("join_activity_logs").insert({
        organization_id: link.organization_id, join_link_id: link.id, participant_id: link.participant_id,
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null, user_agent: ua.slice(0, 400),
      }),
      !link.first_clicked_at && db.from("participants").update({ join_link_clicked: true, first_clicked_at: iso }).eq("id", link.participant_id),
      !link.first_clicked_at && db.from("analytics_events").insert({ organization_id: link.organization_id, webinar_id: w.id, event_type: "join_click" }),
    ]);
  }

  const waiting = (reason: string) => NextResponse.redirect(new URL(`/e/${w.slug}/waiting?t=${token}&r=${reason}`, APP_URL));
  if (p?.status !== "confirmed") return waiting("unconfirmed");
  if (w.status === "cancelled") return waiting("cancelled");
  if (ended) return w.replay_url ? NextResponse.redirect(w.replay_url) : waiting("ended");
  if (!w.meeting_url) return waiting("nolink");
  if (early && !go) return waiting("early");
  return NextResponse.redirect(w.meeting_url);
}
