-- =====================================================================
-- EventOS — storage bucket for webinar images + scheduled job runner
-- =====================================================================

-- Public bucket for cover images & speaker photos
insert into storage.buckets (id, name, public)
values ('webinar-assets', 'webinar-assets', true)
on conflict (id) do nothing;

create policy "webinar assets public read" on storage.objects
  for select using (bucket_id = 'webinar-assets');
create policy "webinar assets member upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'webinar-assets' and public.is_org_member(((storage.foldername(name))[1])::uuid));
create policy "webinar assets member delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'webinar-assets' and public.is_org_member(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------------
-- OPTIONAL: run the automation queue every minute from Supabase itself.
-- 1) Database > Extensions: enable pg_cron and pg_net
-- 2) Replace YOUR_APP_URL and YOUR_CRON_SECRET, then run the block below.
-- (Or use Vercel Cron / Netlify scheduled functions / cron-job.org instead.)
-- ---------------------------------------------------------------------
-- select cron.schedule(
--   'eventos-process-jobs',
--   '* * * * *',
--   $$ select net.http_post(
--        url := 'https://YOUR_APP_URL/api/cron/process-jobs',
--        headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET', 'Content-Type', 'application/json'),
--        body := '{}'::jsonb
--      ) $$
-- );
