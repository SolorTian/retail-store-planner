begin;
create or replace function public.planner_daily_scheduled_open()
returns jsonb language plpgsql security definer set search_path='' as $$
declare d date:=timezone('Asia/Taipei',now())::date; created boolean; admin_id uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server role required' using errcode='42501'; end if;
 select m.id into admin_id from public.planner_members m join auth.users u on u.id=m.id
 where m.active and lower(u.email)='gaexp8213@gmail.com' and u.email_confirmed_at is not null and u.raw_app_meta_data->>'provider'='google';
 if admin_id is null then raise exception 'Active primary administrator required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('planner-global-daily:'||d::text,0));
 insert into planner_private.daily_batches(day,opened_by) values(d,admin_id) on conflict do nothing;
 created:=found;
 if created then
  insert into planner_private.daily_jobs(day,owner_id,fingerprint)
  select d,m.id,md5(c.envelope) from public.planner_members m join auth.users u on u.id=m.id join public.planner_credentials c on c.owner_id=m.id
  where m.active and u.email_confirmed_at is not null and u.raw_app_meta_data->>'provider'='google' and c.data->>'verified'='true' and length(c.envelope)>0;
  insert into planner_private.daily_pending_jobs(day,owner_id,fingerprint)
  select d,p.id,md5(p.envelope) from planner_private.pending_visitors p where p.status<>'disabled'
  and (p.linked_to is null or not exists(select 1 from public.planner_credentials c where c.owner_id=p.linked_to and c.data->>'verified'='true'));
 end if;
 return planner_private.daily_summary(d)||jsonb_build_object('created',created);
end; $$;
revoke all on function public.planner_daily_scheduled_open() from public,anon,authenticated;
grant execute on function public.planner_daily_scheduled_open() to service_role;
commit;