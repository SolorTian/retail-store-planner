create table if not exists planner_private.schedule_requests(
 id uuid primary key,owner_id uuid not null,period text not null,binding_fingerprint text not null,
 status text not null default 'pending',catalog jsonb,plan jsonb,result jsonb,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 dispatch_until timestamptz,approved_at timestamptz,started_at timestamptz
);
alter table planner_private.schedule_requests enable row level security;
revoke all on planner_private.schedule_requests from public,anon,authenticated;
create or replace function public.planner_schedule(action text,request_id uuid,period text default null,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r planner_private.schedule_requests%rowtype;cached planner_private.schedule_requests%rowtype;today date:=timezone('Asia/Taipei',now())::date;n integer;
begin
 if not coalesce(planner_private.active_user(),false) or not coalesce(planner_private.is_admin(),false) then raise exception 'Administrator required' using errcode='42501';end if;
 if request_id is null then raise exception 'Request ID required';end if;
 if action='prepare' then
  if period is null or period!~'^20[0-9]{2}-(0[1-9]|1[0-2])$' or period<to_char(today,'YYYY-MM') or period>to_char(today+interval '3 months','YYYY-MM') then raise exception 'Invalid planning month';end if;
  if not exists(select 1 from public.planner_credentials c where c.owner_id=auth.uid() and c.data->>'verified'='true') then raise exception 'Verified company binding required';end if;
  if (select count(*) from planner_private.schedule_requests where owner_id=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'Too many requests';end if;
  perform pg_advisory_xact_lock(hashtextextended('schedule-cache:'||auth.uid()::text||':'||period,0));
  select q.* into cached from planner_private.schedule_requests q join public.planner_credentials c on c.owner_id=q.owner_id and md5(c.envelope)=q.binding_fingerprint where q.owner_id=auth.uid() and q.period=planner_schedule.period and q.catalog is not null and timezone('Asia/Taipei',q.created_at)::date=today order by q.created_at desc limit 1;
  insert into planner_private.schedule_requests(id,owner_id,period,binding_fingerprint) select request_id,auth.uid(),period,md5(c.envelope) from public.planner_credentials c where c.owner_id=auth.uid() on conflict do nothing;
  if cached.id is not null then update planner_private.schedule_requests set catalog=cached.catalog,status='ready',updated_at=now() where id=request_id and owner_id=auth.uid() and status='pending';end if;
 end if;
 select * into r from planner_private.schedule_requests q where q.id=request_id and q.owner_id=auth.uid() for update;
 if not found then raise exception 'Request unavailable' using errcode='42501';end if;
 if action='status' and r.status in ('reading','writing') and r.started_at<now()-interval '15 minutes' then
  update planner_private.schedule_requests set status=case when r.status='writing' then 'review' else 'error' end,result=jsonb_build_object('message','工作逾時，請至業務王核對；不會自動重送排班。'),updated_at=now() where id=r.id returning * into r;
 end if;
 if action='commit' then
  if r.status in ('queued','writing','done','review') then return jsonb_build_object('id',r.id,'status',r.status,'result',r.result);end if;
  if r.status<>'ready' or timezone('Asia/Taipei',r.created_at)::date<>today then raise exception 'Reload the company catalogue';end if;
  if jsonb_typeof(payload->'cells') is distinct from 'array' or jsonb_array_length(payload->'cells')<1 or jsonb_array_length(payload->'cells')>300 then raise exception 'Select 1 to 300 tasks';end if;
  if payload->>'time' is distinct from '08:00' or payload->>'title' is distinct from '常態工作' or coalesce(payload->>'type','') not in ('0','1') then raise exception 'Invalid task settings';end if;
  if exists(select 1 from jsonb_array_elements(payload->'cells') c where coalesce(c->>'date','')!~'^20[0-9]{2}-(0[1-9]|1[0-2])-[0-3][0-9]$' or left(c->>'date',7)<>r.period or (c->>'date')::date<today or not exists(select 1 from jsonb_array_elements(r.catalog->'customers') s where s->>'id'=c->>'store')) then raise exception 'Invalid task date or customer';end if;
  if payload->>'type'='1' and not exists(select 1 from jsonb_array_elements(r.catalog->'packages') p where p->>'id'=payload->>'package') then raise exception 'Invalid package';end if;
  if payload->>'type'='0' then
   if jsonb_typeof(payload->'custom') is distinct from 'array' or jsonb_array_length(payload->'custom')=0 then raise exception 'Choose custom steps';end if;
   if exists(select 1 from jsonb_array_elements_text(payload->'custom') s where not exists(select 1 from jsonb_array_elements(r.catalog->'custom') p where p->>'id'=s)) then raise exception 'Invalid custom step';end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('schedule:'||auth.uid()::text||':'||r.period,0));
  if exists(select 1 from planner_private.schedule_requests q where q.owner_id=auth.uid() and q.period=r.period and q.id<>r.id and q.status in ('queued','writing','review')) then raise exception 'Another request is running or needs review';end if;
  update planner_private.schedule_requests set plan=payload,status='queued',dispatch_until=null,approved_at=now(),updated_at=now() where id=r.id returning * into r;
 elsif action not in ('prepare','status') then raise exception 'Invalid action';end if;
 return jsonb_build_object('id',r.id,'period',r.period,'status',r.status,'catalog',r.catalog,'result',r.result,'updatedAt',r.updated_at);
end;$$;
revoke all on function public.planner_schedule(text,uuid,text,jsonb) from public,anon;
grant execute on function public.planner_schedule(text,uuid,text,jsonb) to authenticated;

create or replace function public.planner_schedule_worker(action text,request_id uuid,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r planner_private.schedule_requests%rowtype;c public.planner_credentials%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted worker required' using errcode='42501';end if;
 select * into r from planner_private.schedule_requests q where q.id=request_id for update;
 if not found then raise exception 'Request unavailable';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',r.owner_id,'role','authenticated')::text,true);
 if not coalesce(planner_private.active_user(),false) or not coalesce(planner_private.is_admin(),false) then raise exception 'Administrator no longer active' using errcode='42501';end if;
 if action='dispatch' then
  if r.status not in ('pending','queued') or r.dispatch_until>now() then return jsonb_build_object('dispatch',false);end if;
  update planner_private.schedule_requests set dispatch_until=now()+interval '2 minutes' where id=r.id;
  return jsonb_build_object('dispatch',true);
 elsif action='claim' then
  if r.status not in ('pending','queued') then return jsonb_build_object('claimed',false);end if;
  if r.created_at<now()-interval '1 day' or r.status='queued' and r.approved_at<now()-interval '30 minutes' then raise exception 'Expired request';end if;
  select * into c from public.planner_credentials where owner_id=r.owner_id and data->>'verified'='true';
  if not found or md5(c.envelope) is distinct from r.binding_fingerprint then raise exception 'Binding unavailable or changed';end if;
  update planner_private.schedule_requests set status=case when r.status='pending' then 'reading' else 'writing' end,started_at=now(),updated_at=now() where id=r.id;
  return jsonb_build_object('claimed',true,'owner',r.owner_id,'envelope',c.envelope,'accountLabel',c.account_label,'period',r.period,'mode',case when r.status='pending' then 'read' else 'write' end,'plan',r.plan);
 elsif action='catalog' and r.status='reading' then
  update planner_private.schedule_requests set catalog=payload,status='ready',updated_at=now(),dispatch_until=null where id=r.id;
 elsif action='finish' and r.status='writing' then
  update planner_private.schedule_requests set result=payload,status=case when payload->>'verified'='true' then 'done' else 'review' end,updated_at=now() where id=r.id;
 elsif action='fail' and r.status in ('reading','writing') then
  update planner_private.schedule_requests set result=jsonb_build_object('message',case when r.status='writing' then '送出結果尚未確認，請至業務王核對；系統不會自動重送。' else '讀取業務王失敗，請重新讀取。' end),status=case when r.status='writing' then 'review' else 'error' end,updated_at=now() where id=r.id;
 else raise exception 'Invalid worker transition';end if;
 return jsonb_build_object('accepted',true);
end;$$;
revoke all on function public.planner_schedule_worker(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.planner_schedule_worker(text,uuid,jsonb) to service_role;



