# EventOS — Phase 1 MVP

Online webinar management & marketing automation: create a webinar → publish a registration page → collect registrations → track join-link clicks **and** verified attendance → follow up automatically on WhatsApp (WATI) and email (Resend). Paid registration via Razorpay.

**Stack:** Next.js 15 (App Router, TypeScript, Tailwind) · Supabase (Postgres, Auth, Storage, RLS) · WATI API v3 · Resend · Razorpay · Zoom webhooks.

---

## Setup guide (about 30 minutes)

### Step 1 — Create the Supabase project
1. Go to <https://supabase.com/dashboard> → **New project**. Name it `eventos`, pick region **Mumbai (ap-south-1)**, set a strong database password.
2. When it's ready, open **Project Settings → API** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` / publishable key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` / secret key → `SUPABASE_SERVICE_ROLE_KEY` (**server only, never share**)

### Step 2 — Run the database migrations
Open **SQL Editor → New query** and run each file **in order**, one at a time (paste, then *Run*):
1. `supabase/migrations/0001_schema.sql` — all 26 tables, enums, triggers
2. `supabase/migrations/0002_rls.sql` — row-level security / tenant isolation
3. `supabase/migrations/0003_storage_and_cron.sql` — image bucket (leave the cron block commented for now)

Check: **Table Editor** should list `webinars`, `participants`, `automation_jobs`, etc. **Storage** should show a `webinar-assets` bucket.

### Step 3 — Configure Auth
**Authentication → URL Configuration**
- Site URL: `http://localhost:3000` (change to your live domain after deploying)
- Redirect URLs: add `http://localhost:3000/auth/callback` and `https://YOUR-DOMAIN/auth/callback`

**Authentication → Providers → Email**: keep enabled. For quick local testing you can turn off *Confirm email*; turn it back on for production.

### Step 4 — Environment variables
```bash
cp .env.example .env.local
openssl rand -hex 32     # → ENCRYPTION_KEY (64 hex chars). Keep it safe: changing it makes saved WATI/Razorpay keys unreadable.
openssl rand -hex 24     # → CRON_SECRET
```
Fill in the Supabase keys, `NEXT_PUBLIC_APP_URL`, and Resend:
- Resend → **Domains** → add & verify your sending domain (e.g. `mail.aimerbschool.com`) → **API Keys** → create → `RESEND_API_KEY`
- `EMAIL_FROM="AIMER Webinars <webinars@mail.aimerbschool.com>"` (must use the verified domain)

### Step 5 — Run it
```bash
npm install
npm run dev        # http://localhost:3000
```
Sign up → create your organization → **Webinars → New webinar**.

### Step 6 — Deploy
**Vercel (recommended — cron included):** import the repo, add all env vars, deploy. `vercel.json` already runs `/api/cron/process-jobs` every minute (Vercel Pro allows per-minute crons; on Hobby use the Supabase cron below).

**Netlify or anywhere else:** schedule the job runner externally — either
- Supabase: **Database → Extensions** enable `pg_cron` + `pg_net`, then run the commented block at the bottom of `0003_storage_and_cron.sql` with your URL and `CRON_SECRET`; or
- <https://cron-job.org>: every minute, `GET https://YOUR-DOMAIN/api/cron/process-jobs` with header `Authorization: Bearer YOUR_CRON_SECRET`.

Before cron is set up you can press **Automations → Run due jobs now**.

After deploying, update `NEXT_PUBLIC_APP_URL` and the Supabase Site URL to the live domain.

---

## Connecting the integrations (inside the app)

| Integration | Where | What you need |
|---|---|---|
| **WATI** | Dashboard → WhatsApp | API endpoint, API token (scopes `messagetemplatev3` read+write), WhatsApp number. Then paste the shown webhook URL into WATI → Webhooks and enable Sent / Delivered / Read / Replied / Failed. Map each approved template's `{{variables}}` to registration fields. |
| **Email** | Settings → Organization | Sender name + reply-to. Sending domain comes from `EMAIL_FROM`. |
| **Zoom attendance** | Settings → Integrations | Zoom Marketplace app with Event Subscriptions → endpoint URL shown in EventOS → events `meeting.participant_joined` / `meeting.participant_left` → paste Secret Token → Validate. Each webinar needs its Zoom meeting ID (auto-detected from the join URL). |
| **Google Meet** | Webinar → Participants | Paste the Meet link. Import the Meet attendance CSV after the session. |
| **Razorpay** | Settings → Integrations | Key ID + Key Secret, plus a webhook (`payment.captured`, `payment.failed`, `order.paid`) to the URL shown, with a webhook secret. Test with `rzp_test_` keys first. |
| **CRM** | Settings → Integrations | Any webhook URL (n8n / Make / Zapier → Salesforce, LeadSquared, HubSpot). Payloads are signed: `X-EventOS-Signature = HMAC-SHA256(secret, body)`. |

### Suggested WATI templates to get approved
- `eventos_registration_confirmed` — "Hi {{1}}, your registration for {{2}} is confirmed! Date: {{3}} Time: {{4}}. We'll share your joining details before the session."
- `eventos_reminder_1h` — "Hi {{1}}, your webinar starts in one hour! Join here: {{2}} See you soon!"
- `eventos_missed` — "Hi {{1}}, we missed you at {{2}}. You can access the replay here: {{3}}"

Map `{{1}}` → First name, `{{2}}` → Webinar title / Unique join link, etc. on the WhatsApp page, then pick the template in each webinar's **Automations** tab.

---

## How it works

**Participant journey:** Registered → Confirmed → Reminded → Join link clicked → Attended → Follow-up.

- Every registration gets a participant ID (`EVT-XXXXXXX`) and a unique join link `/j/<token>`. The link logs the click and redirects to Zoom/Meet/YouTube (opens 15 min before start). Link-preview bots (WhatsApp, Telegram, Slack…) are ignored so previews don't count as clicks.
- **A click is not attendance.** `join_link_clicked` and `attended` are separate fields. Attendance comes only from Zoom webhooks, a CSV import, or a manual mark.
- **A WATI API success is not delivery.** Messages are logged as `pending` and move to sent → delivered → read / failed only from WATI webhooks.
- Paid registrations stay `pending_payment` until the Razorpay signature (checkout) or webhook is verified.

**Automations** (seeded on every new webinar, each toggle/timing/segment configurable):

| Workflow | When | Audience |
|---|---|---|
| Confirmation + webinar details | immediately | all |
| Reminder | 1 day before | all |
| Joining reminder | 1 hour before | all |
| Starting soon | 15 min before | all |
| Join now | at start | all |
| Thank you | 30 min after end | attended |
| Replay / next session | 1 hour after end | absent |
| Feedback & next step | 1 day after end | all |

Jobs are created per participant at confirmation, rebuilt when the webinar time changes, claimed atomically by the cron worker (no double sends), and retried twice on failure.

**Source tracking:** UTM tags, `fbclid` / `gclid` and the referrer map registrations to Meta, Google, WhatsApp, email, referral or direct. First-touch attribution is kept per visitor.

## Project map
```
supabase/migrations/      SQL schema, RLS, storage, cron
src/app/e/[slug]          public registration page (+ /registered, /waiting)
src/app/j/[token]         tracked unique join link
src/app/dashboard/…       organizer app (overview, webinars, participants, whatsapp, automations, analytics, settings)
src/app/api/v1/…          REST API + webhooks (wati, zoom, payments) ; src/app/api/cron/process-jobs
src/lib/                  registration, automation engine, messaging, attendance, analytics, providers/
```

## API (session-authenticated unless noted)
`GET /api/v1/auth` · `GET /api/v1/organizations` · `GET /api/v1/webinars` · `GET /api/v1/webinars/:id` · `POST /api/v1/webinars/:id/register` *(public)* · `POST /api/v1/webinars/:id/register/verify` *(public)* · `GET /api/v1/webinars/:id/participants` · `GET /api/v1/webinars/:id/participants/export` · `GET /api/v1/webinars/:id/analytics` · `GET /api/v1/webinars/:id/attendance` · `GET /api/v1/webinars/:id/ics` *(public)* · `GET /api/v1/participants/:id` · `GET /api/v1/participants/:id/join-link` · `GET /api/v1/wati/templates` · `POST /api/v1/wati/send` · `POST /api/v1/wati/webhook` *(secret)* · `GET/PATCH /api/v1/automations/:id` · `POST /api/v1/automations/:id/execute` · `POST /api/v1/webhooks/zoom/:orgId` *(signed)* · `POST /api/v1/webhooks/payments/:orgId` *(signed)* · `GET|POST /api/cron/process-jobs` *(CRON_SECRET)*

## Known limits of this MVP
- Google Meet attendance is CSV import only (live sync through the Workspace Reports API is the next step).
- Zoom matches attendees by email (then by exact name). Ask attendees to join signed in, or turn on Zoom registration, for the best match rate.
- Follow-up campaigns send synchronously, which is fine for a few thousand recipients. Move them onto the job queue for larger lists.
- The public-endpoint rate limiter is in-memory, per instance. Use Upstash Redis when you scale out.
- Email delivery status is "sent" on Resend acceptance. Add Resend webhooks for delivered/bounced.
- Not in this phase (by design): offline/hybrid events, a drag-and-drop automation builder, recording hosting.
