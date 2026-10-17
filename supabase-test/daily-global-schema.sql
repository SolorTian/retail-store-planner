-- Global batches are created by an authenticated site opening, never by a schedule.
begin;
create table if not exists planner_private.daily_batches(
 day date primary key, opened_at timestamptz not null default now(),
 opened_by uuid not null, dispatch_token uuid, dispatch_until timestamptz,
 dispatched_at timestamptz, manual_request uuid
);
create table if not exists planner_private.daily_manual_requests(
 day date not null, request_id uuid not null, requested_by uuid not null,
 created_at timestamptz not null default now(),primary key(day,request_id)
);
alter table planner_private.daily_manual_requests enable row level security;
revoke all on planner_private.daily_manual_requests from public,anon,authenticated;
create table if not exists planner_private.daily_jobs(
 day date not null references planner_private.daily_batches(day),
 owner_id uuid not null references public.planner_members(id),
 fingerprint text not null, status text not null default 'pending'
  check(status in ('pending','running','done','failed','ineligible')),
 attempts integer not null default 0, token uuid, lease_until timestamptz,
 available_at timestamptz not null default now(), finished_at timestamptz,
 error_code text, primary key(day,owner_id)
);
create table if not exists planner_private.daily_pending_jobs(
 day date not null references planner_private.daily_batches(day),owner_id uuid not null references planner_private.pending_visitors(id),
 fingerprint text not null,status text not null default 'pending' check(status in ('pending','running','done','failed','ineligible')),
 attempts integer not null default 0,token uuid,lease_until timestamptz,available_at timestamptz not null default now(),finished_at timestamptz,error_code text,
 primary key(day,owner_id)
);
alter table planner_private.daily_pending_jobs enable row level security;
revoke all on planner_private.daily_pending_jobs from public,anon,authenticated;
alter table planner_private.daily_batches enable row level security;
alter table planner_private.daily_jobs enable row level security;
revoke all on planner_private.daily_batches,planner_private.daily_jobs from public,anon,authenticated;

create or replace function planner_private.daily_summary(d date)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('day',d,'total',count(*),'done',count(*) filter(where status='done'),
 'failed',count(*) filter(where status in ('failed','ineligible')),
 'status',case when count(*)=0 then 'no_eligible_accounts'
 when bool_and(status='done') then 'done'
 when bool_and(status in ('done','failed','ineligible')) then 'partial_failure' else 'pending' end)
 from (select status from planner_private.daily_jobs where day=d union all select status from planner_private.daily_pending_jobs where day=d) jobs;
$$;
revoke all on function planner_private.daily_summary(date) from public,anon,authenticated;

create or replace function public.planner_daily_open(manual boolean default false, request_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d date:=timezone('Asia/Taipei',now())::date; created boolean:=false; b planner_private.daily_batches%rowtype;
begin
 if not coalesce(planner_private.active_user(),false) then raise exception 'Active verified member required' using errcode='42501'; end if;
 if not coalesce(planner_private.is_admin(),false) then raise exception 'Primary administrator required' using errcode='42501'; end if;
 if manual and request_id is null then raise exception 'Manual request ID required'; end if;
 -- Only the primary administrator can create today's batch; other members read status.
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

create or replace function public.planner_daily_status()
returns jsonb language plpgsql security definer set search_path='' as $$
declare d date:=timezone('Asia/Taipei',now())::date;
begin
 if not coalesce(planner_private.active_user(),false) then raise exception 'Active verified member required' using errcode='42501'; end if;
 if not exists(select 1 from planner_private.daily_batches where day=d) then
  return jsonb_build_object('day',d,'status','not_started','total',0,'done',0,'failed',0);
 end if;
 return planner_private.daily_summary(d);
end; $$;
revoke all on function public.planner_daily_status() from public,anon;
grant execute on function public.planner_daily_status() to authenticated;

create or replace function planner_private.validate_daily_snapshot(payload jsonb)
returns void language plpgsql security definer set search_path='' as $$ begin
 if jsonb_typeof(payload) is distinct from 'array' then raise exception 'Invalid snapshot'; end if;
 if jsonb_array_length(payload)>200000 or pg_column_size(payload)>25000000 then raise exception 'Snapshot too large'; end if;
 if exists(select 1 from jsonb_array_elements(payload) p where
  coalesce(p->>'bucket','') not in ('customers','visits','workSnapshots','workRecords','settings','work')
  or coalesce(p->>'id','')='' or jsonb_typeof(p->'data') is distinct from 'object'
  or (p->>'bucket'='settings' and coalesce(p->>'id','') not in ('customerMaster','syncReceipt') and coalesce(p->>'id','') !~ '^fuel_[0-9]{4}-[0-9]{2}$')
  or (p->>'bucket'='work' and coalesce(p->>'id','') !~ '^offsets_[0-9]{4}-[0-9]{2}$'))
 then raise exception 'Snapshot outside daily scope'; end if;
 if (select count(*) from jsonb_array_elements(payload) p where p->>'bucket'='workSnapshots')<>2
  or not exists(select 1 from jsonb_array_elements(payload) p where p->>'bucket'='settings' and p->>'id'='customerMaster')
  or not exists(select 1 from jsonb_array_elements(payload) p where p->>'bucket'='settings' and p->>'id'='syncReceipt')
 then raise exception 'Incomplete daily snapshot'; end if;
end; $$;
revoke all on function planner_private.validate_daily_snapshot(jsonb) from public,anon,authenticated;
create or replace function planner_private.apply_daily_snapshot(target uuid,payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare item jsonb;point jsonb;old jsonb;key text;closed jsonb;
begin
 perform planner_private.validate_daily_snapshot(payload);
 select coalesce(data->'codes','[]'::jsonb) into closed from public.planner_documents
  where owner_id=target and bucket='settings' and document_id='closedStores';
 closed:=coalesce(closed,'[]'::jsonb);
 for item in select value from jsonb_array_elements(payload) loop
  key:=item->>'id'; point:=item->'data';
  if item->>'bucket' in ('customers','visits') and closed ? (point->>'code') then continue; end if;
  select data into old from public.planner_documents where owner_id=target and bucket=item->>'bucket' and document_id=key;
  if item->>'bucket'='customers' then
   if point->'gps'='null'::jsonb and jsonb_typeof(old->'gps')='array' then point:=point||jsonb_build_object('gps',old->'gps','gpsSource','previous'); end if;
   point:=coalesce(old,'{}'::jsonb)||point;
  elsif item->>'bucket'='settings' and key like 'fuel_%' then
   if old->>'account'=point->>'account' then point:=old||point; end if;
  elsif item->>'bucket'='settings' and key='customerMaster' then
   point:=jsonb_set(point,'{codes}',coalesce((select jsonb_agg(x) from jsonb_array_elements(point->'codes') x where not closed ? (x#>>'{}')),'[]'::jsonb));
   if old ? 'preferredOwner' then point:=point||jsonb_build_object('preferredOwner',old->'preferredOwner'); end if;
  elsif item->>'bucket'='work' and key like 'offsets_%' and old->>'staff'=point->>'staff' then
   point:=jsonb_set(point,'{items}',coalesce((select jsonb_agg(x) from (
    select distinct on (x->>'id') x from (
     select value as x from jsonb_array_elements(point->'items')
     union all select value as x from jsonb_array_elements(coalesce(old->'items','[]'::jsonb))
      where value->>'day'<point->>'freshStart' or value->>'day'>point->>'freshEnd'
    ) combined order by x->>'id') unique_items),'[]'::jsonb))
    ||jsonb_build_object('rangeStart',least(old->>'rangeStart',point->>'rangeStart'),
     'rangeEnd',greatest(old->>'rangeEnd',point->>'rangeEnd'));
  end if;
  insert into public.planner_documents(owner_id,bucket,document_id,data) values(target,item->>'bucket',key,point)
   on conflict(owner_id,bucket,document_id) do update set data=excluded.data,revision=public.planner_documents.revision+1,updated_at=now();
 end loop;
 -- Keep manual customers; hide company entries removed from the complete export.
 update public.planner_documents d set data=d.data||'{"companyCurrent":false}'::jsonb,revision=d.revision+1,updated_at=now()
  where d.owner_id=target and d.bucket='customers' and coalesce(d.data->>'source','')<>'manual'
  and not exists(select 1 from jsonb_array_elements(payload) p where p->>'bucket'='customers' and p->>'id'=d.document_id);
 delete from public.planner_documents d where d.owner_id=target and d.bucket='workRecords'
  and exists(select 1 from jsonb_array_elements(payload) p where p->>'bucket'='workSnapshots' and left(d.document_id,7)=p->>'id')
  and not exists(select 1 from jsonb_array_elements(payload) p where p->>'bucket'='workRecords' and p->>'id'=d.document_id);
end; $$;
revoke all on function planner_private.apply_daily_snapshot(uuid,jsonb) from public,anon,authenticated;
create or replace function planner_private.pending_daily_worker(action text,batch_day date,target uuid default null,lease uuid default null,payload jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j planner_private.daily_pending_jobs%rowtype;p planner_private.pending_visitors%rowtype;n uuid;documents jsonb;credential text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server role required' using errcode='42501'; end if;
 if action='claim' then
  update planner_private.daily_pending_jobs set status='failed',error_code='attempt_limit' where day=batch_day and status='running' and lease_until<=now() and attempts>=3;
  select * into j from planner_private.daily_pending_jobs where day=batch_day and attempts<3 and ((status='pending' and available_at<=now()) or (status='running' and lease_until<=now())) order by owner_id for update skip locked limit 1;
  if not found then return jsonb_build_object('job',null)||planner_private.daily_summary(batch_day); end if;
  select * into p from planner_private.pending_visitors where id=j.owner_id for share;
  if p.status='disabled' or md5(p.envelope) is distinct from j.fingerprint then
   update planner_private.daily_pending_jobs set status='ineligible',error_code='binding_changed' where day=batch_day and owner_id=j.owner_id;
   return jsonb_build_object('job',null)||planner_private.daily_summary(batch_day);
  end if;
  n:=gen_random_uuid();update planner_private.daily_pending_jobs set status='running',attempts=attempts+1,token=n,lease_until=now()+interval '25 minutes' where day=batch_day and owner_id=j.owner_id;
  return jsonb_build_object('job',jsonb_build_object('owner',p.id,'envelope',p.envelope,'accountLabel',p.account_label,'lease',n,'day',batch_day,'kind','pending_google','linkedTo',p.linked_to));
 end if;
 if action not in ('publish','fail') then raise exception 'Invalid pending action'; end if;
 select * into j from planner_private.daily_pending_jobs where day=batch_day and owner_id=target for update;
 if not found or j.status<>'running' or j.token is distinct from lease or j.lease_until<=now() then raise exception 'Job lease lost' using errcode='40001'; end if;
 if action='fail' then
  update planner_private.daily_pending_jobs set status=case when attempts>=3 then 'failed' else 'pending' end,available_at=now()+interval '60 seconds',token=null,lease_until=null,error_code='export_failed' where day=batch_day and owner_id=target;
  return planner_private.daily_summary(batch_day);
 end if;
 select * into p from planner_private.pending_visitors where id=target for update;
 if p.status='disabled' or md5(p.envelope) is distinct from j.fingerprint then raise exception 'Binding changed' using errcode='40001'; end if;
 documents:=case when jsonb_typeof(payload)='object' then payload->'documents' else payload end;
 credential:=case when jsonb_typeof(payload)='object' then payload->>'credential' else null end;
 perform planner_private.validate_daily_snapshot(documents);
 if p.linked_to is not null then
  perform 1 from public.planner_members m join auth.users u on u.id=m.id where m.id=p.linked_to and m.active and u.email_confirmed_at is not null and u.raw_app_meta_data->>'provider'='google' for share of m;
  if not found then raise exception 'Linked member disabled' using errcode='42501'; end if;
  if exists(select 1 from public.planner_credentials where owner_id=p.linked_to and lower(account_label)<>lower(p.account_label)) then raise exception 'Linked company account changed' using errcode='40001'; end if;
  if credential is null or length(credential)>20000 or (credential::jsonb)->>'version'<>'1' then raise exception 'Re-encrypted binding required'; end if;
  insert into public.planner_credentials(owner_id,envelope,account_label,data)
   values(p.linked_to,credential,p.account_label,jsonb_build_object('version',1,'verified',true,'verifiedAt',now())) on conflict(owner_id) do nothing;
  perform planner_private.apply_daily_snapshot(p.linked_to,documents);
 end if;
 update planner_private.pending_visitors set last_snapshot=documents,last_source_at=now() where id=target;
 update planner_private.daily_pending_jobs set status='done',finished_at=now(),token=null,lease_until=null,error_code=null where day=batch_day and owner_id=target;
 return planner_private.daily_summary(batch_day);
end; $$;
revoke all on function planner_private.pending_daily_worker(text,date,uuid,uuid,jsonb) from public,anon,authenticated;

create or replace function public.planner_link_pending_visitor(profile uuid,member uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p planner_private.pending_visitors%rowtype;
begin
 if not coalesce(planner_private.is_admin(),false) then raise exception 'Primary administrator required' using errcode='42501'; end if;
 select * into p from planner_private.pending_visitors where id=profile for update;
 if not found or p.status='disabled' then raise exception 'Pending visitor unavailable'; end if;
 if p.linked_to is not null and p.linked_to<>member then raise exception 'Already linked'; end if;
 perform 1 from public.planner_members m join auth.users u on u.id=m.id where m.id=member and m.active and u.email_confirmed_at is not null and u.raw_app_meta_data->>'provider'='google' for share of m;
 if not found then raise exception 'Verified active Google member required' using errcode='42501'; end if;
 if exists(select 1 from public.planner_credentials where owner_id=member and lower(account_label)<>lower(p.account_label)) then raise exception 'Company account differs'; end if;
 update planner_private.pending_visitors set linked_to=member,status='linked',linked_at=now() where id=profile;
 if p.last_snapshot is not null then perform planner_private.apply_daily_snapshot(member,p.last_snapshot); end if;
 return jsonb_build_object('status','linked');
end; $$;
revoke all on function public.planner_link_pending_visitor(uuid,uuid) from public,anon;
grant execute on function public.planner_link_pending_visitor(uuid,uuid) to authenticated;
-- Only a trusted server may dispatch, obtain a credential, or publish a target's data.
create or replace function public.planner_daily_worker(action text,batch_day date,
 target uuid default null,lease uuid default null,payload jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j planner_private.daily_jobs%rowtype; b planner_private.daily_batches%rowtype;
 point jsonb; item jsonb; old jsonb; cred record; n uuid; key text; closed jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server role required' using errcode='42501'; end if;
 if action not in ('dispatch','dispatched','claim','publish','fail','summary') then raise exception 'Invalid worker action'; end if;
 select * into b from planner_private.daily_batches where day=batch_day for update;
 if not found then raise exception 'No user-triggered batch'; end if;
 if action='summary' then return planner_private.daily_summary(batch_day); end if;
 if action='dispatch' then
  if (planner_private.daily_summary(batch_day)->>'status')<>'pending'
   or b.dispatch_until>now() or b.dispatched_at>now()-interval '10 minutes'
   or exists(select 1 from planner_private.daily_jobs where day=batch_day and status='running' and lease_until>now())
  then return jsonb_build_object('dispatch',false); end if;
  n:=gen_random_uuid(); update planner_private.daily_batches set dispatch_token=n,dispatch_until=now()+interval '2 minutes' where day=batch_day;
  return jsonb_build_object('dispatch',true,'lease',n);
 elsif action='dispatched' then
  if b.dispatch_token is distinct from lease or b.dispatch_until<=now() then raise exception 'Dispatch lease lost' using errcode='40001'; end if;
  update planner_private.daily_batches set dispatched_at=now(),dispatch_until=null,dispatch_token=null where day=batch_day;
  return jsonb_build_object('accepted',true);
 elsif action='claim' then
  -- Expired workers cannot overwrite a later attempt: every claim gets a new token.
  update planner_private.daily_jobs set status='failed',error_code='attempt_limit'
   where day=batch_day and status='running' and lease_until<=now() and attempts>=3;
  select * into j from planner_private.daily_jobs where day=batch_day and attempts<3
   and ((status='pending' and available_at<=now()) or (status='running' and lease_until<=now()))
   order by owner_id for update skip locked limit 1;
  if not found then return planner_private.pending_daily_worker('claim',batch_day); end if;
  select c.envelope,c.account_label,md5(c.envelope) as fingerprint into cred
   from public.planner_credentials c join public.planner_members m on m.id=c.owner_id
   join auth.users u on u.id=m.id where c.owner_id=j.owner_id and m.active
   and u.email_confirmed_at is not null and u.raw_app_meta_data->>'provider'='google' and c.data->>'verified'='true';
  if not found or cred.fingerprint is distinct from j.fingerprint then
   update planner_private.daily_jobs set status='ineligible',error_code='binding_changed' where day=batch_day and owner_id=j.owner_id;
   return jsonb_build_object('job',null)||planner_private.daily_summary(batch_day);
  end if;
  n:=gen_random_uuid();
  update planner_private.daily_jobs set status='running',attempts=attempts+1,token=n,lease_until=now()+interval '25 minutes'
   where day=batch_day and owner_id=j.owner_id;
  return jsonb_build_object('job',jsonb_build_object('owner',j.owner_id,'lease',n,'envelope',cred.envelope,'accountLabel',cred.account_label,'day',batch_day));
 end if;
 if exists(select 1 from planner_private.daily_pending_jobs where day=batch_day and owner_id=target) then return planner_private.pending_daily_worker(action,batch_day,target,lease,payload); end if;
 select * into j from planner_private.daily_jobs where day=batch_day and owner_id=target for update;
 if not found or j.status<>'running' or j.token is distinct from lease or j.lease_until<=now()
 then raise exception 'Job lease lost' using errcode='40001'; end if;
 if action='fail' then
  update planner_private.daily_jobs set status=case when attempts>=3 then 'failed' else 'pending' end,
   available_at=now()+interval '60 seconds',token=null,lease_until=null,error_code='export_failed'
   where day=batch_day and owner_id=target;
  return planner_private.daily_summary(batch_day);
 end if;
 -- Lock membership and binding through publication; revocation/rebinding races are rejected.
 perform 1 from public.planner_members m join auth.users u on u.id=m.id
  where m.id=target and m.active and u.email_confirmed_at is not null and u.raw_app_meta_data->>'provider'='google' for share of m;
 if not found then raise exception 'Account disabled' using errcode='42501'; end if;
 select md5(envelope) as fingerprint into cred from public.planner_credentials where owner_id=target and data->>'verified'='true' for share;
 if not found or cred.fingerprint is distinct from j.fingerprint then raise exception 'Binding changed' using errcode='40001'; end if;
 perform planner_private.apply_daily_snapshot(target,payload);
 update planner_private.daily_jobs set status='done',finished_at=now(),token=null,lease_until=null,error_code=null
  where day=batch_day and owner_id=target;
 return planner_private.daily_summary(batch_day);
end; $$;
revoke all on function public.planner_daily_worker(text,date,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.planner_daily_worker(text,date,uuid,uuid,jsonb) to service_role;
commit;

