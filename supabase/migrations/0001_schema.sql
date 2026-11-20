-- =====================================================================
-- EventOS Phase 1 — core schema
-- Multi-tenant: every business row carries organization_id.
-- Run in Supabase SQL Editor (in order: 0001, 0002, 0003).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Enums ----------
create type member_role as enum ('owner', 'admin', 'member');
create type webinar_platform as enum ('zoom', 'google_meet', 'youtube_live', 'custom');
create type webinar_status as enum ('draft', 'published', 'completed', 'cancelled');
create type registration_type as enum ('free', 'paid', 'invite_only', 'approval');
create type participant_status as enum ('pending_payment', 'pending_approval', 'confirmed', 'rejected', 'cancelled');
create type payment_status as enum ('not_required', 'pending', 'paid', 'failed', 'refunded');
create type delivery_status as enum ('pending', 'sent', 'delivered', 'read', 'failed');
create type followup_status as enum ('pending', 'completed');
create type message_channel as enum ('whatsapp', 'email');
create type job_status as enum ('pending', 'running', 'done', 'skipped', 'failed', 'cancelled');
create type workflow_trigger as enum (
  'registration_confirmed',   -- immediately after confirmation
  'before_start',             -- offset_minutes before start (e.g. 1440, 60, 15)
  'at_start',                 -- when webinar starts
  'after_end'                 -- offset_minutes after scheduled end
);
create type audience_segment as enum ('all', 'attended', 'absent', 'clicked_not_attended');

-- ---------- Users & organizations ----------
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  website text,
  timezone text not null default 'Asia/Kolkata',
  email_from_name text,
  email_reply_to text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role member_role not null default 'member',
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid references public.users(id),
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

-- ---------- Webinars ----------
create table public.webinars (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null unique,
  title text not null,
  short_description text,
  description text,
  cover_image_url text,
  host_name text,
  host_details text,
  organizer_info text,
  learning_outcomes text[] not null default '{}',
  starts_at timestamptz not null,
  duration_minutes int not null default 60 check (duration_minutes > 0),
  timezone text not null default 'Asia/Kolkata',
  language text not null default 'English',
  platform webinar_platform not null default 'zoom',
  meeting_url text,
  meeting_id text,            -- Zoom meeting ID (digits) used to match attendance webhooks
  meeting_passcode text,
  capacity int check (capacity is null or capacity > 0),
  registration_type registration_type not null default 'free',
  invite_code text,
  status webinar_status not null default 'draft',
  replay_url text,
  feedback_url text,
  next_step_url text,
  published_at timestamptz,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.webinars (organization_id, starts_at desc);

create table public.webinar_speakers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  webinar_id uuid not null references public.webinars(id) on delete cascade,
  name text not null,
  title text,
  bio text,
  photo_url text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.webinar_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  webinar_id uuid not null references public.webinars(id) on delete cascade,
  title text,
  starts_at timestamptz not null,
  duration_minutes int not null default 60,
  meeting_url text,
  meeting_id text,
  created_at timestamptz not null default now()
);

-- ---------- Registration ----------
create table public.registration_forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  webinar_id uuid not null unique references public.webinars(id) on delete cascade,
  -- standard field toggles: {"phone":{"enabled":true,"required":true}, "company":{...}, ...}
  fields jsonb not null default '{
    "phone": {"enabled": true, "required": true},
    "company": {"enabled": false, "required": false},
    "designation": {"enabled": false, "required": false},
    "location": {"enabled": false, "required": false}
  }'::jsonb,
  consent_text text not null default 'I agree to receive webinar updates on WhatsApp and email.',
  submit_label text not null default 'Register Now',
  success_message text not null default 'You''re registered! Check WhatsApp and email for details.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.registration_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  webinar_id uuid not null references public.webinars(id) on delete cascade,
  label text not null,
  type text not null default 'text' check (type in ('text', 'textarea', 'select', 'radio', 'checkbox')),
  options text[] not null default '{}',
  required boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  webinar_id uuid not null references public.webinars(id) on delete cascade,
  name text not null,
  description text,
  price_minor int not null default 0 check (price_minor >= 0),   -- paise
  currency text not null default 'INR',
  quantity int check (quantity is null or quantity > 0),
  is_active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- A participant row = one registration for one webinar.
create table public.participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  webinar_id uuid not null references public.webinars(id) on delete cascade,
  participant_code text not null unique,
  full_name text not null,
  email text not null,
  phone text,
  company text,
  designation text,
  location text,
  ticket_id uuid references public.tickets(id) on delete set null,
  status participant_status not null default 'confirmed',
  payment_status payment_status not null default 'not_required',
  confirmation_status delivery_status not null default 'pending',
  reminder_status delivery_status not null default 'pending',
  followup_status followup_status not null default 'pending',
  -- source attribution
  source text not null default 'direct',   -- meta | google | whatsapp | email | direct | referral | other
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  referrer text,
  -- join link vs. real attendance are deliberately separate
  join_link_clicked boolean not null default false,
  first_clicked_at timestamptz,
  attended boolean not null default false,
  join_time timestamptz,
  leave_time timestamptz,
  attended_minutes int not null default 0,
  consent_whatsapp boolean not null default false,
  consent_email boolean not null default true,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (webinar_id, email)
);
create index on public.participants (organization_id, created_at desc);
create index on public.participants (webinar_id, status);

create table public.participant_answers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  question_id uuid references public.registration_questions(id) on delete set null,
  question_label text not null,
  answer text,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  webinar_id uuid not null references public.webinars(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete set null,
  amount_minor int not null,
  currency text not null default 'INR',
  provider text not null default 'razorpay',
  provider_order_id text unique,
  status text not null default 'created' check (status in ('created', 'paid', 'failed', 'refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  provider_payment_id text unique,
  amount_minor int,
  currency text,
  status text not null,
  method text,
  verified_via text,   -- 'checkout_signature' | 'webhook'
  raw jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Join links & attendance ----------
create table public.webinar_join_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  webinar_id uuid not null references public.webinars(id) on delete cascade,
  participant_id uuid not null unique references public.participants(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  click_count int not null default 0,
  first_clicked_at timestamptz,
  last_clicked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.join_activity_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  join_link_id uuid not null references public.webinar_join_links(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  ip text,
  user_agent text,
  clicked_at timestamptz not null default now()
);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  webinar_id uuid not null references public.webinars(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete set null,
  provider text not null,              -- zoom | google_meet | csv_import | manual
  provider_participant_id text,
  name text,
  email text,
  join_time timestamptz,
  leave_time timestamptz,
  duration_seconds int,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index on public.attendance_records (webinar_id, email);

-- ---------- Messaging & automation ----------
create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel message_channel not null,
  name text not null,
  subject text,                 -- email only
  body text,                    -- email body (supports {{variables}})
  wati_template_name text,      -- whatsapp only (approved template)
  variable_mapping jsonb not null default '[]'::jsonb,  -- [{"param":"1","variable":"name"}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.automation_workflows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  webinar_id uuid not null references public.webinars(id) on delete cascade,
  key text not null,            -- e.g. confirmation, reminder_24h
  name text not null,
  trigger workflow_trigger not null,
  offset_minutes int not null default 0,
  segment audience_segment not null default 'all',
  send_whatsapp boolean not null default true,
  send_email boolean not null default true,
  whatsapp_template_id uuid references public.message_templates(id) on delete set null,
  email_template_id uuid references public.message_templates(id) on delete set null,
  enabled boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (webinar_id, key)
);

create table public.automation_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null references public.automation_workflows(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  run_at timestamptz not null,
  status job_status not null default 'pending',
  attempts int not null default 0,
  last_error text,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workflow_id, participant_id)
);
create index on public.automation_jobs (status, run_at);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  webinar_id uuid not null references public.webinars(id) on delete cascade,
  name text not null,
  segment audience_segment not null default 'all',
  send_whatsapp boolean not null default false,
  send_email boolean not null default true,
  whatsapp_template_id uuid references public.message_templates(id) on delete set null,
  email_template_id uuid references public.message_templates(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'failed')),
  recipients_count int not null default 0,
  sent_at timestamptz,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.message_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  webinar_id uuid references public.webinars(id) on delete set null,
  participant_id uuid references public.participants(id) on delete set null,
  workflow_id uuid references public.automation_workflows(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  channel message_channel not null,
  provider text not null,                 -- wati | resend
  provider_message_id text,               -- WATI localMessageId / Resend id
  recipient text not null,
  template_name text,
  subject text,
  status delivery_status not null default 'pending',
  error text,
  status_updated_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.message_logs (organization_id, created_at desc);
create index on public.message_logs (provider, provider_message_id);

-- ---------- Integrations ----------
create table public.wati_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  api_base_url text not null default 'https://live-mt-server.wati.io',
  tenant_id text,                         -- only needed for legacy v1/v2 endpoints
  access_token_encrypted text not null,   -- AES-256-GCM, never returned to the browser
  channel_number text not null,           -- WhatsApp number, digits with country code
  webhook_secret text not null default encode(gen_random_bytes(18), 'hex'),
  status text not null default 'connected',
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('zoom', 'google_meet', 'razorpay', 'crm_webhook')),
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,           -- non-secret settings
  secrets_encrypted text,                               -- encrypted JSON of secrets
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  provider text not null,
  event_type text,
  external_id text,
  payload jsonb not null,
  processed boolean not null default false,
  error text,
  received_at timestamptz not null default now()
);
create index on public.webhook_events (provider, received_at desc);

create table public.analytics_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  webinar_id uuid not null references public.webinars(id) on delete cascade,
  event_type text not null check (event_type in ('page_view', 'form_start', 'registration', 'join_click')),
  visitor_id text,
  source text,
  utm_source text, utm_medium text, utm_campaign text,
  referrer text,
  created_at timestamptz not null default now()
);
create index on public.analytics_events (webinar_id, event_type, created_at);

-- ---------- updated_at triggers ----------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['webinars','registration_forms','participants','orders','message_templates',
                           'automation_workflows','wati_connections','integrations']
  loop
    execute format('create trigger trg_%I_updated before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- ---------- Profile row on signup ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();
