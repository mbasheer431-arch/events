import { TIMEZONES } from "@/lib/utils";

export type WebinarDefaults = Partial<{
  title: string; slug: string; short_description: string; description: string; host_name: string; host_details: string;
  organizer_info: string; learning_outcomes: string[]; starts_at_local: string; duration_minutes: number; timezone: string;
  language: string; platform: string; meeting_url: string; meeting_id: string; meeting_passcode: string; capacity: number | null;
  registration_type: string; invite_code: string; cover_image_url: string;
}>;

export function BasicsFields({ d = {} }: { d?: WebinarDefaults }) {
  return (
    <div className="grid gap-4">
      <label className="block"><span className="label">Webinar title *</span>
        <input name="title" required defaultValue={d.title} className="input" placeholder="Digital Marketing Masterclass" /></label>
      <label className="block"><span className="label">Short description</span>
        <input name="short_description" defaultValue={d.short_description} maxLength={200} className="input" placeholder="One line shown under the title and in link previews" /></label>
      <label className="block"><span className="label">Full description</span>
        <textarea name="description" rows={5} defaultValue={d.description} className="input" /></label>
      <label className="block"><span className="label">What attendees will learn</span>
        <textarea name="learning_outcomes" rows={4} defaultValue={d.learning_outcomes?.join("\n")} className="input" placeholder={"One outcome per line\nBuild a Meta Ads funnel\nAutomate WhatsApp follow-ups"} /></label>
      <label className="block"><span className="label">Cover image</span>
        <input name="cover_image" type="file" accept="image/*" className="input" />
        <span className="hint block">1200×630 works best for ads and social previews. Max 4 MB.{d.cover_image_url ? " Leave empty to keep the current image." : ""}</span></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="label">Host name</span><input name="host_name" defaultValue={d.host_name} className="input" /></label>
        <label className="block"><span className="label">Custom URL slug</span><input name="slug" defaultValue={d.slug} className="input" placeholder="digital-marketing-masterclass" />
          <span className="hint block">eventos.com/e/your-slug</span></label>
      </div>
      <label className="block"><span className="label">Host details</span><textarea name="host_details" rows={2} defaultValue={d.host_details} className="input" /></label>
      <label className="block"><span className="label">Organizer information</span><textarea name="organizer_info" rows={2} defaultValue={d.organizer_info} className="input" placeholder="Shown at the bottom of the registration page" /></label>
    </div>
  );
}

export function ScheduleFields({ d = {}, orgTz }: { d?: WebinarDefaults; orgTz: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block"><span className="label">Date and time *</span>
        <input name="starts_at_local" type="datetime-local" required defaultValue={d.starts_at_local} className="input" /></label>
      <label className="block"><span className="label">Time zone *</span>
        <select name="timezone" defaultValue={d.timezone || orgTz} className="input">{TIMEZONES.map((t) => <option key={t}>{t}</option>)}</select></label>
      <label className="block"><span className="label">Duration (minutes) *</span>
        <input name="duration_minutes" type="number" min={10} max={600} required defaultValue={d.duration_minutes || 60} className="input" /></label>
      <label className="block"><span className="label">Language</span>
        <input name="language" defaultValue={d.language || "English"} className="input" list="langs" />
        <datalist id="langs"><option>English</option><option>Malayalam</option><option>Arabic</option><option>Hindi</option><option>Tamil</option></datalist></label>
    </div>
  );
}

export function AccessFields({ d = {} }: { d?: WebinarDefaults }) {
  return (
    <div className="grid gap-4">
      <label className="block"><span className="label">Webinar platform *</span>
        <select name="platform" defaultValue={d.platform || "zoom"} className="input">
          <option value="zoom">Zoom</option><option value="google_meet">Google Meet</option>
          <option value="youtube_live">YouTube Live</option><option value="custom">Custom streaming URL</option>
        </select></label>
      <label className="block"><span className="label">Meeting or streaming link</span>
        <input name="meeting_url" type="url" defaultValue={d.meeting_url} className="input" placeholder="https://zoom.us/j/81234567890?pwd=…" />
        <span className="hint block">Attendees never see this directly — each gets a unique tracked link that redirects here. Required before publishing.</span></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="label">Zoom meeting ID</span><input name="meeting_id" defaultValue={d.meeting_id} className="input" placeholder="Auto-detected from Zoom links" />
          <span className="hint block">Used to match Zoom attendance webhooks.</span></label>
        <label className="block"><span className="label">Passcode</span><input name="meeting_passcode" defaultValue={d.meeting_passcode} className="input" /></label>
      </div>
    </div>
  );
}

export function RegistrationTypeFields({ d = {}, showTicket = false }: { d?: WebinarDefaults; showTicket?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block"><span className="label">Registration type *</span>
        <select name="registration_type" defaultValue={d.registration_type || "free"} className="input">
          <option value="free">Free — instant confirmation</option>
          <option value="paid">Paid — Razorpay checkout</option>
          <option value="approval">Approval-based — you approve each registrant</option>
          <option value="invite_only">Invite-only — needs the invite link</option>
        </select></label>
      <label className="block"><span className="label">Registration capacity</span>
        <input name="capacity" type="number" min={1} defaultValue={d.capacity ?? ""} className="input" placeholder="Unlimited" /></label>
      <label className="block"><span className="label">Invite code (invite-only)</span>
        <input name="invite_code" defaultValue={d.invite_code} className="input" placeholder="Auto-generated if empty" /></label>
      {showTicket && (
        <>
          <label className="block"><span className="label">Ticket name (paid)</span><input name="ticket_name" className="input" placeholder="General admission" /></label>
          <label className="block"><span className="label">Ticket price (paid)</span><input name="ticket_price" type="number" min={0} step="0.01" className="input" placeholder="499" /></label>
          <label className="block"><span className="label">Currency</span>
            <select name="currency" className="input" defaultValue="INR"><option>INR</option><option>AED</option><option>SAR</option><option>USD</option></select></label>
        </>
      )}
    </div>
  );
}
