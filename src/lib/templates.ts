import { APP_URL, formatDate, formatTime, webinarEnd } from "@/lib/utils";

export const VARIABLES = [
  { key: "name", label: "Full name" },
  { key: "first_name", label: "First name" },
  { key: "email", label: "Email" },
  { key: "participant_id", label: "Participant ID" },
  { key: "webinar_title", label: "Webinar title" },
  { key: "date", label: "Webinar date" },
  { key: "time", label: "Webinar time" },
  { key: "join_link", label: "Unique join link" },
  { key: "event_page", label: "Event page link" },
  { key: "replay_link", label: "Replay link" },
  { key: "feedback_link", label: "Feedback link" },
  { key: "next_step_link", label: "Next-step link" },
  { key: "host_name", label: "Host name" },
  { key: "organizer", label: "Organization name" },
] as const;
export type VariableKey = (typeof VARIABLES)[number]["key"];

export type VarContext = {
  participant: { full_name: string; email: string; participant_code: string };
  webinar: { slug: string; title: string; starts_at: string; duration_minutes: number; timezone: string; host_name?: string | null; replay_url?: string | null; feedback_url?: string | null; next_step_url?: string | null };
  orgName: string;
  joinToken?: string | null;
};

export function buildVariables(c: VarContext): Record<VariableKey, string> {
  const eventPage = `${APP_URL}/e/${c.webinar.slug}`;
  return {
    name: c.participant.full_name,
    first_name: c.participant.full_name.split(/\s+/)[0] || c.participant.full_name,
    email: c.participant.email,
    participant_id: c.participant.participant_code,
    webinar_title: c.webinar.title,
    date: formatDate(c.webinar.starts_at, c.webinar.timezone),
    time: formatTime(c.webinar.starts_at, c.webinar.timezone),
    join_link: c.joinToken ? `${APP_URL}/j/${c.joinToken}` : eventPage,
    event_page: eventPage,
    replay_link: c.webinar.replay_url || eventPage,
    feedback_link: c.webinar.feedback_url || eventPage,
    next_step_link: c.webinar.next_step_url || c.webinar.feedback_url || eventPage,
    host_name: c.webinar.host_name || c.orgName,
    organizer: c.orgName,
  };
}

export function render(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function emailHtml(bodyText: string, opts: { orgName: string; ctaUrl?: string; ctaLabel?: string }) {
  const paragraphs = esc(bodyText)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#127489">$1</a>')
    .split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>")}</p>`).join("");
  const cta = opts.ctaUrl
    ? `<p style="margin:22px 0"><a href="${opts.ctaUrl}" style="background:#127489;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${esc(opts.ctaLabel || "Open")}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1f2937">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;padding:28px;font-size:15px;line-height:1.6">
<tr><td><img src="${APP_URL}/brand/logo.png" alt="${esc(opts.orgName)}" height="40" style="height:40px;margin-bottom:20px"><div style="height:3px;background:#168AA2;border-radius:2px;margin-bottom:20px"></div>${paragraphs}${cta}<p style="margin-top:26px;color:#6b7280;font-size:12px">Sent by ${esc(opts.orgName)} via EventOS</p></td></tr>
</table></td></tr></table></body></html>`;
}

/** Built-in workflows seeded for each new webinar (mirrors the spec's WhatsApp automation table). */
export const DEFAULT_WORKFLOWS = [
  { key: "confirmation", name: "Registration confirmation + webinar details", trigger: "registration_confirmed", offset_minutes: 0, segment: "all", cta: "join" },
  { key: "reminder_24h", name: "Reminder — 1 day before", trigger: "before_start", offset_minutes: 1440, segment: "all", cta: "join" },
  { key: "reminder_1h", name: "Joining reminder — 1 hour before", trigger: "before_start", offset_minutes: 60, segment: "all", cta: "join" },
  { key: "starting_15m", name: "Starting soon — 15 minutes before", trigger: "before_start", offset_minutes: 15, segment: "all", cta: "join" },
  { key: "join_now", name: "Webinar started — join now", trigger: "at_start", offset_minutes: 0, segment: "all", cta: "join" },
  { key: "thank_you", name: "Thank you (attended)", trigger: "after_end", offset_minutes: 30, segment: "attended", cta: "feedback" },
  { key: "missed", name: "Replay / next session (did not attend)", trigger: "after_end", offset_minutes: 60, segment: "absent", cta: "replay" },
  { key: "feedback", name: "Feedback & next-step CTA", trigger: "after_end", offset_minutes: 1440, segment: "all", cta: "next" },
] as const;

export const DEFAULT_EMAILS: Record<string, { subject: string; body: string }> = {
  confirmation: {
    subject: "You're registered: {{webinar_title}}",
    body: "Hi {{first_name}},\n\nYour registration for {{webinar_title}} is confirmed!\n\nDate: {{date}}\nTime: {{time}}\nParticipant ID: {{participant_id}}\n\nUse your personal joining link on the day (please don't share it — it's unique to you):\n{{join_link}}\n\nSee you there,\n{{organizer}}",
  },
  reminder_24h: {
    subject: "Tomorrow: {{webinar_title}}",
    body: "Hi {{first_name}},\n\nA quick reminder that {{webinar_title}} is tomorrow.\n\nDate: {{date}}\nTime: {{time}}\n\nYour joining link: {{join_link}}",
  },
  reminder_1h: {
    subject: "Starts in 1 hour: {{webinar_title}}",
    body: "Hi {{first_name}},\n\n{{webinar_title}} starts in one hour ({{time}}).\n\nJoin here: {{join_link}}\n\nSee you soon!",
  },
  starting_15m: {
    subject: "Starting in 15 minutes: {{webinar_title}}",
    body: "Hi {{first_name}},\n\nWe're starting in 15 minutes. Grab a seat!\n\n{{join_link}}",
  },
  join_now: {
    subject: "We're live: {{webinar_title}}",
    body: "Hi {{first_name}},\n\n{{webinar_title}} is live now. Join here:\n{{join_link}}",
  },
  thank_you: {
    subject: "Thanks for joining {{webinar_title}}",
    body: "Hi {{first_name}},\n\nThank you for attending {{webinar_title}}! We'd love your feedback — it takes a minute:\n{{feedback_link}}",
  },
  missed: {
    subject: "We missed you at {{webinar_title}}",
    body: "Hi {{first_name}},\n\nWe missed you at {{webinar_title}}. You can watch the replay here:\n{{replay_link}}",
  },
  feedback: {
    subject: "What's next after {{webinar_title}}",
    body: "Hi {{first_name}},\n\nThanks again for registering for {{webinar_title}}. Here's your next step:\n{{next_step_link}}\n\nWe'd also value your feedback: {{feedback_link}}",
  },
  campaign: { subject: "{{webinar_title}}", body: "Hi {{first_name}},\n\n" },
};

export function ctaFor(key: string, vars: Record<string, string>) {
  const wf = DEFAULT_WORKFLOWS.find((w) => w.key === key);
  switch (wf?.cta) {
    case "join": return { url: vars.join_link, label: "Join webinar" };
    case "feedback": return { url: vars.feedback_link, label: "Give feedback" };
    case "replay": return { url: vars.replay_link, label: "Watch replay" };
    case "next": return { url: vars.next_step_link, label: "Next step" };
    default: return undefined;
  }
}
