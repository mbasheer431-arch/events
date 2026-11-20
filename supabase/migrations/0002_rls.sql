-- =====================================================================
-- EventOS — Row Level Security (tenant isolation)
-- Organizer dashboard uses the signed-in user's session -> RLS applies.
-- Public pages, webhooks and cron use the service role on the server only.
-- =====================================================================

create or replace function public.is_org_member(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from organization_members where organization_id = org and user_id = auth.uid());
$$;

create or replace function public.is_org_admin(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from organization_members
                 where organization_id = org and user_id = auth.uid() and role in ('owner', 'admin'));
$$;

-- Atomic: create org + make caller the owner
create or replace function public.create_organization(p_name text, p_slug text, p_timezone text default 'Asia/Kolkata')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into organizations (name, slug, timezone, created_by)
  values (p_name, p_slug, coalesce(p_timezone, 'Asia/Kolkata'), auth.uid()) returning id into v_id;
  insert into organization_members (organization_id, user_id, role) values (v_id, auth.uid(), 'owner');
  return v_id;
end $$;

-- Accept a team invite (email must match the signed-in user)
create or replace function public.accept_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_inv organization_invites; v_email text;
begin
  select email into v_email from auth.users where id = auth.uid();
  select * into v_inv from organization_invites
   where token = p_token and accepted_at is null and expires_at > now();
  if v_inv.id is null then raise exception 'invite invalid or expired'; end if;
  if lower(v_inv.email) <> lower(v_email) then raise exception 'invite was sent to a different email'; end if;
  insert into organization_members (organization_id, user_id, role)
  values (v_inv.organization_id, auth.uid(), v_inv.role)
  on conflict (organization_id, user_id) do nothing;
  update organization_invites set accepted_at = now() where id = v_inv.id;
  return v_inv.organization_id;
end $$;

grant execute on function public.create_organization(text, text, text) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;

-- ---------- users ----------
alter table public.users enable row level security;
create policy users_self_select on public.users for select using (
  id = auth.uid() or exists (
    select 1 from organization_members m1 join organization_members m2 on m1.organization_id = m2.organization_id
    where m1.user_id = auth.uid() and m2.user_id = users.id));
create policy users_self_update on public.users for update using (id = auth.uid());

-- ---------- organizations ----------
alter table public.organizations enable row level security;
create policy org_select on public.organizations for select using (public.is_org_member(id));
create policy org_update on public.organizations for update using (public.is_org_admin(id));

-- ---------- members & invites (admin managed) ----------
alter table public.organization_members enable row level security;
create policy members_select on public.organization_members for select using (public.is_org_member(organization_id));
create policy members_admin_write on public.organization_members for all
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

alter table public.organization_invites enable row level security;
create policy invites_admin on public.organization_invites for all
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

-- ---------- standard tenant tables: any member can read/write ----------
do $$
declare t text;
begin
  foreach t in array array[
    'webinars','webinar_speakers','webinar_sessions','registration_forms','registration_questions',
    'tickets','participants','participant_answers','orders','payments','webinar_join_links',
    'join_activity_logs','attendance_records','message_templates','automation_workflows',
    'automation_jobs','campaigns','message_logs','analytics_events','webhook_events']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id))',
                   t || '_tenant', t);
  end loop;
end $$;

-- ---------- integration secrets: admins only ----------
alter table public.wati_connections enable row level security;
create policy wati_select on public.wati_connections for select using (public.is_org_member(organization_id));
create policy wati_admin_write on public.wati_connections for all
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

alter table public.integrations enable row level security;
create policy integrations_select on public.integrations for select using (public.is_org_member(organization_id));
create policy integrations_admin_write on public.integrations for all
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

-- Secrets are stored AES-256-GCM encrypted with ENCRYPTION_KEY (server env only),
-- so even a member reading the row only sees ciphertext. The app never selects these columns client-side.
