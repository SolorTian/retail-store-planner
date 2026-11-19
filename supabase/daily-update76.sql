begin;
create table if not exists planner_private.daily_survey_jobs76(day date not null references planner_private.daily_batches(day),task text not null,request_id uuid references planner_private.survey_requests(id),error text,primary key(day,task));
alter table planner_private.daily_survey_jobs76 enable row level security;
revoke all on planner_private.daily_survey_jobs76 from public,anon,authenticated;
create or replace function public.planner_daily_surveys76(batch_day date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare admin_id uuid;binding_hash text;p record;s date;e date;r uuid;d date:=timezone('Asia/Taipei',now())::date;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted worker required' using errcode='42501';end if;
 if batch_day is null or batch_day>d or not exists(select 1 from planner_private.daily_batches where day=batch_day) then raise exception 'Daily batch required';end if;
 perform pg_advisory_xact_lock(hashtextextended('daily-surveys76:'||batch_day::text,0));
 select c.owner_id,md5(c.envelope) into admin_id,binding_hash from public.planner_credentials c join public.planner_members m on m.id=c.owner_id join auth.users u on u.id=m.id where m.active and lower(u.email)='gaexp8213@gmail.com' and u.email_confirmed_at is not null and u.raw_app_meta_data->>'provider'='google' and c.data->>'verified'='true';
 if not exists(select 1 from planner_private.daily_survey_jobs76 where day=batch_day) then
  insert into planner_private.daily_survey_jobs76(day,task) values(batch_day,'catalogue');
  insert into planner_private.daily_survey_jobs76(day,task) select batch_day,id::text from planner_private.survey_projects where not archived and (config->>'range'<>'fixed' or (config->>'start')::date<=d);
  for p in select j.task,sp.id,sp.config,sp.revision from planner_private.daily_survey_jobs76 j left join planner_private.survey_projects sp on sp.id::text=j.task where j.day=batch_day loop
   if admin_id is null then update planner_private.daily_survey_jobs76 set error='主使用者尚無有效業務王綁定' where day=batch_day and task=p.task;continue;end if;
   s:=case when p.config->>'range'='fixed' then (p.config->>'start')::date else (date_trunc('month',d)-interval '1 month')::date end;
   e:=case when p.config->>'range'='fixed' then least((p.config->>'end')::date,d) else d end;
   r:=gen_random_uuid();
   insert into planner_private.survey_requests(id,owner_id,project_id,revision,config,start_day,end_day,binding) values(r,admin_id,p.id,p.revision,p.config,s,e,binding_hash);
   update planner_private.daily_survey_jobs76 set request_id=r where day=batch_day and task=p.task;
  end loop;
 end if;
 update planner_private.survey_requests q set status='error',error='主使用者業務王綁定已變更',updated_at=now() from planner_private.daily_survey_jobs76 j where j.day=batch_day and j.request_id=q.id and q.status='pending' and (admin_id is null or q.owner_id<>admin_id or q.binding<>binding_hash);
 -- Fence abandoned work; retain old report rather than claim a successful refresh.
 update planner_private.survey_requests q set status='error',error='每日報表讀取逾時，請手動重試',updated_at=now() from planner_private.daily_survey_jobs76 j where j.day=batch_day and j.request_id=q.id and q.status='reading' and q.lease_until<now();
 if exists(select 1 from planner_private.survey_requests q where q.owner_id=admin_id and q.status='reading' and q.lease_until>now()) then return jsonb_build_object('waiting',true);end if;
 select j.request_id into r from planner_private.daily_survey_jobs76 j join planner_private.survey_requests q on q.id=j.request_id where j.day=batch_day and q.status='pending' order by (j.task='catalogue') desc,j.task limit 1;
 return jsonb_build_object('request',r);
end;$$;
revoke all on function public.planner_daily_surveys76(date) from public,anon,authenticated;
grant execute on function public.planner_daily_surveys76(date) to service_role;
create or replace function public.planner_daily_extra_status76()
returns jsonb language plpgsql security definer set search_path='' as $$
declare d date:=timezone('Asia/Taipei',now())::date;items jsonb;
begin
 if not coalesce(planner_private.active_user(),false) then raise exception 'Active verified member required' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('task',case when j.task='catalogue' then '問卷選單' when coalesce(planner_private.is_admin(),false) then coalesce(p.config->>'name','專案報表') else '專案報表' end,'status',case when j.error is not null then 'error' when q.status='done' and q.project_id is not null and p.result->>'complete'='false' then 'partial_failure' else coalesce(q.status,'error') end,'updatedAt',q.updated_at,'error',coalesce(j.error,q.error)) order by j.task),'[]'::jsonb) into items from planner_private.daily_survey_jobs76 j left join planner_private.survey_requests q on q.id=j.request_id left join planner_private.survey_projects p on p.id=q.project_id where j.day=d;
 return jsonb_build_object('day',d,'items',items,'initialized',jsonb_array_length(items)>0);
end;$$;
revoke all on function public.planner_daily_extra_status76() from public,anon;
grant execute on function public.planner_daily_extra_status76() to authenticated;

create or replace function planner_private.daily_summary(d date)
returns jsonb language sql stable security definer set search_path='' as $$
with members as(select status from planner_private.daily_jobs where day=d union all select status from planner_private.daily_pending_jobs where day=d),m as(
select count(*) total,count(*) filter(where status='done') done,count(*) filter(where status in ('failed','ineligible')) failed,
case when count(*)=0 then 'no_eligible_accounts' when bool_and(status='done') then 'done' when bool_and(status in ('done','failed','ineligible')) then 'partial_failure' else 'pending' end status from members),x as(
select count(*) total,count(*) filter(where q.status='done' and (q.project_id is null or p.result->>'complete' is distinct from 'false')) done,count(*) filter(where j.error is not null or q.status='error' or (q.status='done' and p.result->>'complete'='false')) failed from planner_private.daily_survey_jobs76 j left join planner_private.survey_requests q on q.id=j.request_id left join planner_private.survey_projects p on p.id=q.project_id where j.day=d)
select jsonb_build_object('day',d,'total',m.total,'done',m.done,'failed',m.failed,'memberStatus',m.status,'extraTotal',x.total,'extraDone',x.done,'extraFailed',x.failed,'status',case when not exists(select 1 from planner_private.daily_batches where day=d) then 'not_started' when m.status='pending' or x.total=0 or x.done+x.failed<x.total then 'pending' when m.failed+x.failed>0 then 'partial_failure' else 'done' end) from m cross join x;
$$;
revoke all on function planner_private.daily_summary(date) from public,anon,authenticated;

create or replace function public.planner_daily_open(manual boolean default false, request_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d date:=timezone('Asia/Taipei',now())::date; created boolean:=false; b planner_private.daily_batches%rowtype;
begin
 if not coalesce(planner_private.active_user(),false) then raise exception 'Active verified member required' using errcode='42501'; end if;
 if manual and not coalesce(planner_private.is_admin(),false) then raise exception 'Primary administrator required' using errcode='42501'; end if;
 if manual and request_id is null then raise exception 'Manual request ID required'; end if;
 if not manual and timezone('Asia/Taipei',now())::time<time '15:00' then return planner_private.daily_summary(d)||jsonb_build_object('created',false,'waitingUntil','15:00');end if;
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
  and not exists(select 1 from planner_private.daily_pending_jobs where day=d and status in ('pending','running'))
  and not exists(select 1 from planner_private.daily_survey_jobs76 j join planner_private.survey_requests q on q.id=j.request_id where j.day=d and q.status in ('pending','reading')) then
  update planner_private.daily_batches set manual_request=request_id,dispatch_token=null,dispatch_until=null,dispatched_at=null where day=d;
  delete from planner_private.daily_jobs where day=d;
  delete from planner_private.daily_pending_jobs where day=d;
  created:=true;
 end if;
 if created then
  delete from planner_private.daily_survey_jobs76 where day=d;
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


commit;
