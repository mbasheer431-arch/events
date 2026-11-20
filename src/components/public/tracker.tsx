"use client";
import { useEffect } from "react";

const KEY = "eventos_attr";

export function getVisitorId() {
  try {
    let id = localStorage.getItem("eventos_vid");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("eventos_vid", id); }
    return id;
  } catch { return undefined; }
}

/** First-touch attribution per webinar, kept so a later direct return doesn't overwrite the ad source. */
export function getAttribution(webinarId: string): Record<string, string | null> {
  const url = new URL(window.location.href);
  const p = Object.fromEntries(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid", "gbraid", "wbraid"].map((k) => [k, url.searchParams.get(k)]));
  const current = { ...p, referrer: document.referrer && !document.referrer.startsWith(window.location.origin) ? document.referrer : null };
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || "{}");
    const hasSignal = Object.values(current).some(Boolean);
    if (!all[webinarId] || (hasSignal && !Object.values(all[webinarId]).some(Boolean))) { all[webinarId] = current; localStorage.setItem(KEY, JSON.stringify(all)); }
    return all[webinarId];
  } catch { return current; }
}

export function PageViewTracker({ webinarId }: { webinarId: string }) {
  useEffect(() => {
    const body = JSON.stringify({ webinar_id: webinarId, event_type: "page_view", visitor_id: getVisitorId(), attribution: getAttribution(webinarId) });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/v1/track", new Blob([body], { type: "application/json" }));
    else fetch("/api/v1/track", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
  }, [webinarId]);
  return null;
}
