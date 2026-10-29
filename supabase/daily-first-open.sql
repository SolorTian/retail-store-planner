begin;
create or replace function public.planner_daily_open(manual boolean default false, request_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d date:=timezone('Asia/Taipei',now())::date; created boolean:=false; b planner_private.daily_batches%rowtype;
begin
 if not coalesce(planner_private.active_user(),false) then raise exception 'Active verified member required' using errcode='42501'; end if;
 if manual and not coalesce(planner_private.is_admin(),false) then raise exception 'Primary administrator required' using errcode='42501'; end if;
 if manual and request_id is null then raise exception 'Manual request ID required'; end if;
 -- First verified active member creates today's batch; manual resets remain administrator-only.
 perform pg_advisory_xact_lock(hashtextextended('planner-global-daily:'||d::text,0));
 insert into planner_private.daily_batches(day,opened_by) values(d,auth.uid()) on conflict do nothing;
 created:=found;
 if manual then
  insert into planner_private.daily_manual_requests(day,request_id,requested_by) values(d,request_id,auth.uid()) on conflict do nothing;
  if not found then return planner_private.daily_summary(d)||jsonb_build_object('created',false); end if;
 end if;
 select * into b from planner_private.daily_batches where day=d for update;
 if manual and b.manual_request is distinct from request_id
  and not exists(select 1 from planner_private.daily_jobs where day=d and status in ('pending','running'))
  and not exists(select 1 from planner_private.daily_pending_jobs where day=d and status in ('pending','running')) then
  update planner_private.daily_batches set manual_request=request_id,dispatch_token=null,dispatch_until=null,dispatched_at=null where day=d;
  delete from planner_private.daily_jobs where day=d;
  delete from planner_private.daily_pending_jobs where day=d;
  created:=true;
 end if;
 if created then
  insert into planner_private.daily_jobs(day,owner_id,fingerprint)
  select d,m.id,md5(c.envelope) from public.planner_members m
  join auth.users u on u.id=m.id join public.planner_credentials c on c.owner_id=m.id
  where m.active and u.email_confirmed_at is not null and u.raw_app_meta_data->>'provider'='google'
   and c.data->>'verified'='true' and length(c.envelope)>0;
  insert into planner_private.daily_pending_jobs(day,owner_id,fingerprint)
  select d,p.id,md5(p.envelope) from planner_private.pending_visitors p where p.status<>'disabled'
   and (p.linked_to is null or not exists(select 1 from public.planner_credentials c where c.owner_id=p.linked_to and c.data->>'verified'='true'));

 end if;
 return planner_private.daily_summary(d)||jsonb_build_object('created',created,
 'notEligible',(select count(*) from public.planner_members m where m.active and not exists(
  select 1 from planner_private.daily_jobs j where j.day=d and j.owner_id=m.id)));
end; $$;
revoke all on function public.planner_daily_open(boolean,uuid) from public,anon;
grant execute on function public.planner_daily_open(boolean,uuid) to authenticated;


create or replace function public.planner_daily_details()
returns jsonb language plpgsql security definer set search_path='' as $$
declare d date:=timezone('Asia/Taipei',now())::date;
begin
 if not coalesce(planner_private.is_admin(),false) then raise exception 'Primary administrator required' using errcode='42501'; end if;
 return planner_private.daily_summary(d)||jsonb_build_object(
 'openedAt',(select opened_at from planner_private.daily_batches where day=d),
 'dispatchedAt',(select dispatched_at from planner_private.daily_batches where day=d),
 'people',coalesce((select jsonb_agg(jsonb_build_object('name',x.name,'account',x.account_label,'status',x.status,'attempts',x.attempts,'finishedAt',x.finished_at,'error',x.error_code) order by x.name)
 from (
 select coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),u.email) as name,c.account_label,j.status,j.attempts,j.finished_at,j.error_code
 from planner_private.daily_jobs j join auth.users u on u.id=j.owner_id left join public.planner_credentials c on c.owner_id=j.owner_id where j.day=d
 union all select p.account_label,p.account_label,j.status,j.attempts,j.finished_at,j.error_code from planner_private.daily_pending_jobs j join planner_private.pending_visitors p on p.id=j.owner_id where j.day=d
 ) x),'[]'::jsonb));
end; $$;
revoke all on function public.planner_daily_details() from public,anon;
grant execute on function public.planner_daily_details() to authenticated;
commit;