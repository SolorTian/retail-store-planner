begin;
alter table planner_private.daily_batches add column if not exists current_slot79 integer not null default 0;
alter table planner_private.daily_batches add column if not exists requested_slot79 integer not null default 0;
alter table planner_private.daily_batches add column if not exists completed_slot79 integer not null default 0;
alter table planner_private.daily_batches add column if not exists generation79 uuid;
alter table planner_private.daily_batches add column if not exists morning_summary79 jsonb;
alter table planner_private.daily_batches add column if not exists afternoon_summary79 jsonb;
create or replace function planner_private.daily_window79(at_time timestamptz)
returns integer language sql immutable set search_path='' as $$select case when timezone('Asia/Taipei',at_time)::time>=time '15:00' then 2 when timezone('Asia/Taipei',at_time)::time>=time '08:00' then 1 else 0 end$$;
revoke all on function planner_private.daily_window79(timestamptz) from public,anon,authenticated;
create or replace function planner_private.daily_summary_base79(d date)
returns jsonb language sql stable security definer set search_path='' as $$
with members as(select status from planner_private.daily_jobs where day=d union all select status from planner_private.daily_pending_jobs where day=d),m as(
select count(*) total,count(*) filter(where status='done') done,count(*) filter(where status in ('failed','ineligible')) failed,
case when count(*)=0 then 'no_eligible_accounts' when bool_and(status='done') then 'done' when bool_and(status in ('done','failed','ineligible')) then 'partial_failure' else 'pending' end status from members),x as(
select count(*) total,count(*) filter(where q.status='done' and (q.project_id is null or p.result->>'complete' is distinct from 'false')) done,count(*) filter(where j.error is not null or q.status='error' or (q.status='done' and p.result->>'complete'='false')) failed from planner_private.daily_survey_jobs76 j left join planner_private.survey_requests q on q.id=j.request_id left join planner_private.survey_projects p on p.id=q.project_id where j.day=d)
select jsonb_build_object('day',d,'total',m.total,'done',m.done,'failed',m.failed,'memberStatus',m.status,'extraTotal',x.total,'extraDone',x.done,'extraFailed',x.failed,'status',case when not exists(select 1 from planner_private.daily_batches where day=d) then 'not_started' when m.status='pending' or x.total=0 or x.done+x.failed<x.total then 'pending' when m.failed+x.failed>0 then 'partial_failure' else 'done' end) from m cross join x;
$$;
revoke all on function planner_private.daily_summary_base79(date) from public,anon,authenticated;


-- Existing in-flight batches retain their leases and are never reset by migration.
update planner_private.daily_batches set current_slot79=case when timezone('Asia/Taipei',opened_at)::time>=time '15:00' then 2 else 1 end,requested_slot79=case when timezone('Asia/Taipei',opened_at)::time>=time '15:00' then 2 else 1 end,generation79=gen_random_uuid() where generation79 is null;
create or replace function planner_private.daily_advance79(d date)
returns boolean language plpgsql security definer set search_path='' as $$
declare b planner_private.daily_batches%rowtype;s jsonb;slot integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('planner-global-daily:'||d::text,0));
 select * into b from planner_private.daily_batches where day=d for update;if not found then return false;end if;
 s:=planner_private.daily_summary_base79(d);
 if b.current_slot79>0 and s->>'status' in ('done','partial_failure','no_eligible_accounts') then
  update planner_private.daily_batches set completed_slot79=greatest(completed_slot79,current_slot79),morning_summary79=case when current_slot79=1 then s||jsonb_build_object('finishedAt',now()) else morning_summary79 end,afternoon_summary79=case when current_slot79=2 then s||jsonb_build_object('finishedAt',now()) else afternoon_summary79 end where day=d returning * into b;
 elsif b.current_slot79>0 then return false;
 end if;
 if b.requested_slot79<=b.completed_slot79 then return false;end if;
 slot:=b.requested_slot79;
 -- Only terminal job generations are replaced; old workers fail existing token fencing.
 delete from planner_private.daily_survey_jobs76 where day=d;
 delete from planner_private.daily_jobs where day=d;
 delete from planner_private.daily_pending_jobs where day=d;
 update planner_private.daily_batches set current_slot79=slot,generation79=gen_random_uuid(),opened_at=now(),dispatch_token=null,dispatch_until=null,dispatched_at=null where day=d;
 insert into planner_private.daily_jobs(day,owner_id,fingerprint)
 select d,m.id,md5(c.envelope) from public.planner_members m join auth.users u on u.id=m.id join public.planner_credentials c on c.owner_id=m.id where m.active and u.email_confirmed_at is not null and u.raw_app_meta_data->>'provider'='google' and c.data->>'verified'='true' and length(c.envelope)>0;
 insert into planner_private.daily_pending_jobs(day,owner_id,fingerprint)
 select d,p.id,md5(p.envelope) from planner_private.pending_visitors p where p.status<>'disabled' and (p.linked_to is null or not exists(select 1 from public.planner_credentials c where c.owner_id=p.linked_to and c.data->>'verified'='true'));
 return true;
end;$$;
revoke all on function planner_private.daily_advance79(date) from public,anon,authenticated;
create or replace function planner_private.daily_summary(d date)
returns jsonb language sql stable security definer set search_path='' as $$
select planner_private.daily_summary_base79(d)||coalesce((select jsonb_build_object('slot',b.current_slot79,'requestedSlot',b.requested_slot79,'generation',b.generation79,'syncKey',d::text||':'||b.generation79::text,'morning',case when b.current_slot79=1 then planner_private.daily_summary_base79(d) else b.morning_summary79 end,'afternoon',case when b.current_slot79=2 then planner_private.daily_summary_base79(d) else b.afternoon_summary79 end) from planner_private.daily_batches b where day=d),'{}'::jsonb);
$$;
revoke all on function planner_private.daily_summary(date) from public,anon,authenticated;
create or replace function public.planner_daily_open(manual boolean default false,request_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d date:=timezone('Asia/Taipei',now())::date;slot integer:=planner_private.daily_window79(now());started boolean:=false;b planner_private.daily_batches%rowtype;
begin
 if not coalesce(planner_private.active_user(),false) then raise exception 'Active verified member required' using errcode='42501';end if;
 if manual and not coalesce(planner_private.is_admin(),false) then raise exception 'Primary administrator required' using errcode='42501';end if;
 if manual and request_id is null then raise exception 'Manual request ID required';end if;
 if slot=0 and not manual then return planner_private.daily_summary(d)||jsonb_build_object('created',false,'waitingUntil','08:00');end if;
 perform pg_advisory_xact_lock(hashtextextended('planner-global-daily:'||d::text,0));
 insert into planner_private.daily_batches(day,opened_by) values(d,auth.uid()) on conflict do nothing;
 if manual then
  perform planner_private.daily_advance79(d);
  select * into b from planner_private.daily_batches where day=d for update;
  if b.current_slot79>0 and planner_private.daily_summary_base79(d)->>'status'='pending' then return planner_private.daily_summary(d)||jsonb_build_object('created',false);end if;
  insert into planner_private.daily_manual_requests(day,request_id,requested_by) values(d,request_id,auth.uid()) on conflict do nothing;
  if not found then return planner_private.daily_summary(d)||jsonb_build_object('created',false);end if;
  slot:=greatest(slot,b.current_slot79,1);
  update planner_private.daily_batches set current_slot79=0,completed_slot79=least(completed_slot79,slot-1),requested_slot79=greatest(requested_slot79,slot),manual_request=request_id where day=d;
 else
  update planner_private.daily_batches set requested_slot79=greatest(requested_slot79,slot) where day=d;
 end if;
 started:=planner_private.daily_advance79(d);
 return planner_private.daily_summary(d)||jsonb_build_object('created',started);
end;$$;
revoke all on function public.planner_daily_open(boolean,uuid) from public,anon;
grant execute on function public.planner_daily_open(boolean,uuid) to authenticated;
create or replace function public.planner_daily_advance79(batch_day date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare started boolean;s jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted worker required' using errcode='42501';end if;
 if batch_day is null or batch_day>timezone('Asia/Taipei',now())::date then raise exception 'Invalid day';end if;
 started:=planner_private.daily_advance79(batch_day);s:=planner_private.daily_summary(batch_day);
 return s||jsonb_build_object('started',started,'continue',s->>'status'='pending');
end;$$;
revoke all on function public.planner_daily_advance79(date) from public,anon,authenticated;
grant execute on function public.planner_daily_advance79(date) to service_role;
create or replace function public.planner_daily_surveys79(batch_day date,batch_generation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b planner_private.daily_batches%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted worker required' using errcode='42501';end if;
 select * into b from planner_private.daily_batches where day=batch_day for share;
 if not found or b.generation79 is distinct from batch_generation then return jsonb_build_object('changed',true);end if;
 return public.planner_daily_surveys76(batch_day);
end;$$;
revoke all on function public.planner_daily_surveys79(date,uuid) from public,anon,authenticated;
grant execute on function public.planner_daily_surveys79(date,uuid) to service_role;
commit;
