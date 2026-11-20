import { clsx, type ClassValue } from "clsx";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const cn = (...v: ClassValue[]) => clsx(v);

export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

export function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").slice(0, 60);
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function randomCode(len = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function participantCode() { return `EVT-${randomCode(7)}`; }

export function formatDate(iso: string | Date, tz = "Asia/Kolkata") {
  return formatInTimeZone(new Date(iso), tz, "EEE, d MMM yyyy");
}
export function formatTime(iso: string | Date, tz = "Asia/Kolkata") {
  return formatInTimeZone(new Date(iso), tz, "h:mm a zzz");
}
export function formatDateTime(iso: string | Date | null | undefined, tz = "Asia/Kolkata") {
  if (!iso) return "—";
  return formatInTimeZone(new Date(iso), tz, "d MMM yyyy, h:mm a");
}
/** "2026-12-01T18:30" in timezone tz -> UTC ISO */
export function localToUtcIso(local: string, tz: string) {
  return fromZonedTime(local, tz).toISOString();
}
/** UTC ISO -> "yyyy-MM-ddTHH:mm" in tz (for datetime-local inputs) */
export function utcToLocalInput(iso: string, tz: string) {
  return formatInTimeZone(new Date(iso), tz, "yyyy-MM-dd'T'HH:mm");
}

export function formatMoney(minor: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100);
}

/** Normalise to digits with country code, no "+" (what WATI expects). Defaults to India for 10-digit numbers. */
export function normalizePhone(raw: string | null | undefined, defaultCc = "91") {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = defaultCc + d;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

export type Attribution = {
  source: string; utm_source?: string | null; utm_medium?: string | null; utm_campaign?: string | null;
  utm_content?: string | null; utm_term?: string | null; referrer?: string | null;
};

/** Map UTMs / click IDs / referrer to a channel: meta | google | whatsapp | email | referral | direct */
export function detectSource(p: Record<string, string | null | undefined>, referrer?: string | null): string {
  const s = (p.utm_source || "").toLowerCase();
  if (p.fbclid || /^(fb|facebook|ig|instagram|meta)/.test(s)) return "meta";
  if (p.gclid || p.gbraid || p.wbraid || /^(google|adwords|youtube|gads)/.test(s)) return "google";
  if (/^(whatsapp|wa|wati)\b/.test(s)) return "whatsapp";
  if (/email|newsletter|mail/.test(s) || (p.utm_medium || "").toLowerCase() === "email") return "email";
  if (s) return s.slice(0, 30);
  if (referrer) {
    const r = referrer.toLowerCase();
    if (/facebook|instagram|fb\.|l\.instagram/.test(r)) return "meta";
    if (/google\./.test(r)) return "google";
    if (/whatsapp|wa\.me/.test(r)) return "whatsapp";
    return "referral";
  }
  return "direct";
}

export function webinarEnd(w: { starts_at: string; duration_minutes: number }) {
  return new Date(new Date(w.starts_at).getTime() + w.duration_minutes * 60_000);
}

export function csvEscape(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); rows.push(row); row = []; cur = "";
    } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

export const TIMEZONES = [
  "Asia/Kolkata", "Asia/Dubai", "Asia/Riyadh", "Asia/Qatar", "Asia/Kuwait", "Asia/Bahrain", "Asia/Muscat",
  "Asia/Singapore", "Asia/Kuala_Lumpur", "Europe/London", "Europe/Berlin", "America/New_York",
  "America/Chicago", "America/Los_Angeles", "Australia/Sydney", "UTC",
];
