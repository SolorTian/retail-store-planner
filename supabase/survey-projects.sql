begin;
create table if not exists planner_private.survey_projects(id uuid primary key,config jsonb not null,revision bigint not null default 1,archived boolean not null default false,result jsonb,updated_at timestamptz not null default now());
create table if not exists planner_private.survey_catalogue(singleton boolean primary key default true check(singleton),data jsonb not null,updated_at timestamptz not null default now());
create table if not exists planner_private.survey_requests(id uuid primary key,owner_id uuid not null,project_id uuid references planner_private.survey_projects(id),revision bigint,config jsonb,start_day date not null,end_day date not null,binding text not null,status text not null default 'pending' check(status in ('pending','reading','done','error')),token uuid,lease_until timestamptz,dispatch_until timestamptz,error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
alter table planner_private.survey_projects enable row level security;
alter table planner_private.survey_catalogue enable row level security;
alter table planner_private.survey_requests enable row level security;
revoke all on planner_private.survey_projects,planner_private.survey_catalogue,planner_private.survey_requests from public,anon,authenticated;
create or replace function public.planner_survey_projects(action text,p_id uuid default null,p_payload jsonb default '{}'::jsonb,expected_revision bigint default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p planner_private.survey_projects%rowtype;c jsonb:=p_payload->'config';
begin
 if not coalesce(planner_private.is_admin(),false) then raise exception 'Primary administrator required' using errcode='42501';end if;
 if action='list' then return jsonb_build_object('projects',coalesce((select jsonb_agg(jsonb_build_object('id',id,'config',config,'revision',revision,'archived',archived,'sourceAt',result->>'sourceAt') order by updated_at desc) from planner_private.survey_projects),'[]'::jsonb),'catalogue',(select data from planner_private.survey_catalogue where singleton),'catalogueAt',(select updated_at from planner_private.survey_catalogue where singleton));end if;
 if action='read' then select * into p from planner_private.survey_projects where id=p_id; if not found then raise exception 'Project unavailable';end if;return jsonb_build_object('id',p.id,'config',p.config,'revision',p.revision,'archived',p.archived,'result',p.result);end if;
 if action<>'save' or p_id is null then raise exception 'Invalid project action';end if;
 if jsonb_typeof(c) is distinct from 'object' or length(btrim(coalesce(c->>'name',''))) not between 1 and 100 or length(coalesce(c->>'keyword',''))>200 or coalesce(c->>'range','') not in ('recent2','fixed') or coalesce(c->>'requirePhotos','') not in ('true','false') then raise exception 'Invalid project settings';end if;
 if jsonb_typeof(c->'stores') is distinct from 'array' or jsonb_array_length(c->'stores') not between 1 and 500 or jsonb_typeof(c->'surveys') is distinct from 'array' or jsonb_array_length(c->'surveys') not between 1 and 8 then raise exception 'Select stores and questionnaires';end if;
 if exists(select 1 from jsonb_array_elements(c->'stores') x where length(coalesce(x->>'code','')) not between 1 and 150 or length(coalesce(x->>'name','')) not between 1 and 200) or exists(select 1 from jsonb_array_elements(c->'surveys') x where coalesce(x->>'id','')!~'^[0-9]{1,10}$' or length(coalesce(x->>'name','')) not between 1 and 200) then raise exception 'Invalid project targets';end if;
 if c->>'range'='fixed' and (coalesce(c->>'start','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(c->>'end','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then raise exception 'Date range required';end if;
 if c->>'range'='fixed' and ((c->>'start')::date>(c->>'end')::date or (c->>'end')::date-(c->>'start')::date>365) then raise exception 'Invalid date range';end if;
 perform pg_advisory_xact_lock(hashtextextended('survey-project:'||p_id::text,0));
 select * into p from planner_private.survey_projects where id=p_id for update;
 if found then if p.revision<>expected_revision then raise exception 'Project changed; reload' using errcode='40001';end if;update planner_private.survey_projects set config=c,archived=coalesce((p_payload->>'archived')::boolean,false),revision=revision+1,updated_at=now() where id=p_id returning * into p;
 else if expected_revision<>0 or (select count(*) from planner_private.survey_projects)>=100 then raise exception 'Project limit or revision conflict';end if;insert into planner_private.survey_projects(id,config) values(p_id,c) returning * into p;end if;
 return jsonb_build_object('id',p.id,'revision',p.revision);
end;$$;
create or replace function public.planner_survey_request(request_id uuid,project_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p planner_private.survey_projects%rowtype;r planner_private.survey_requests%rowtype;d date:=timezone('Asia/Taipei',now())::date;s date;e date;b text;
begin
 if not coalesce(planner_private.is_admin(),false) then raise exception 'Primary administrator required' using errcode='42501';end if;
 if request_id is null then raise exception 'Request ID required';end if;
 select md5(c.envelope) into b from public.planner_credentials c where c.owner_id=auth.uid() and c.data->>'verified'='true';if b is null then raise exception 'Verified company binding required';end if;
 if project_id is not null then select * into p from planner_private.survey_projects where id=project_id and not archived;if not found then raise exception 'Project unavailable';end if;end if;
 s:=case when p.config->>'range'='fixed' then (p.config->>'start')::date else (date_trunc('month',d)-interval '1 month')::date end;e:=case when p.config->>'range'='fixed' then least((p.config->>'end')::date,d) else d end;if s>e or e-s>365 then raise exception 'Invalid date range';end if;
 perform pg_advisory_xact_lock(hashtextextended('survey-read:'||auth.uid()::text,0));
 update planner_private.survey_requests set status='error',error='讀取逾時，請重新更新。',updated_at=now() where owner_id=auth.uid() and status in ('pending','reading') and created_at<now()-interval '15 minutes';
 select * into r from planner_private.survey_requests q where q.owner_id=auth.uid() and q.status in ('pending','reading') order by created_at desc limit 1;
 if found then if r.project_id is distinct from project_id then raise exception 'Another report is loading';end if;else
 if (select count(*) from planner_private.survey_requests where owner_id=auth.uid() and created_at>now()-interval '1 hour')>=30 then raise exception 'Too many report requests';end if;
 insert into planner_private.survey_requests(id,owner_id,project_id,revision,config,start_day,end_day,binding) values(request_id,auth.uid(),project_id,p.revision,p.config,s,e,b) returning * into r;end if;
 return jsonb_build_object('id',r.id,'status',r.status,'start',r.start_day,'end',r.end_day);
end;$$;
create or replace function public.planner_survey_status(request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r planner_private.survey_requests%rowtype;
begin if not coalesce(planner_private.is_admin(),false) then raise exception 'Primary administrator required' using errcode='42501';end if;select * into r from planner_private.survey_requests where id=request_id and owner_id=auth.uid();if not found then raise exception 'Request unavailable';end if;return jsonb_build_object('id',r.id,'status',case when r.status in ('pending','reading') and r.created_at<now()-interval '15 minutes' then 'error' else r.status end,'error',r.error,'start',r.start_day,'end',r.end_day,'updatedAt',r.updated_at);end;$$;
create or replace function public.planner_survey_worker(action text,request_id uuid,lease uuid default null,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r planner_private.survey_requests%rowtype;credential_row record;t uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted worker required' using errcode='42501';end if;
 select * into r from planner_private.survey_requests where id=request_id for update;if not found then raise exception 'Request unavailable';end if;
 if action='dispatch' then if r.status<>'pending' or r.dispatch_until>now() then return jsonb_build_object('dispatch',false);end if;update planner_private.survey_requests set dispatch_until=now()+interval '2 minutes' where id=r.id;return jsonb_build_object('dispatch',true);end if;
 if action='claim' then
 if r.status<>'pending' then return jsonb_build_object('claimed',false);end if;
 select credential.envelope,credential.account_label into credential_row from public.planner_credentials credential join public.planner_members m on m.id=credential.owner_id join auth.users u on u.id=m.id where credential.owner_id=r.owner_id and m.active and lower(u.email)='gaexp8213@gmail.com' and u.email_confirmed_at is not null and u.raw_app_meta_data->>'provider'='google' and credential.data->>'verified'='true' and md5(credential.envelope)=r.binding;
 if not found then raise exception 'Administrator binding changed' using errcode='42501';end if;
 t:=gen_random_uuid();update planner_private.survey_requests set status='reading',token=t,lease_until=now()+interval '12 minutes',updated_at=now() where id=r.id;
 return jsonb_build_object('claimed',true,'owner',r.owner_id,'envelope',credential_row.envelope,'accountLabel',credential_row.account_label,'lease',t,'config',r.config,'start',r.start_day,'end',r.end_day);
 end if;
 if r.status<>'reading' or r.token is distinct from lease or r.lease_until<=now() then raise exception 'Report lease lost' using errcode='40001';end if;
 if action='fail' then update planner_private.survey_requests set status='error',error='問卷報表讀取未完成，請重新確認日期與業務王連線。',token=null,lease_until=null,updated_at=now() where id=r.id;return '{}'::jsonb;end if;
 if action<>'finish' or pg_column_size(payload)>5000000 then raise exception 'Invalid report result';end if;
 if not exists(select 1 from public.planner_credentials c join public.planner_members m on m.id=c.owner_id join auth.users u on u.id=m.id where c.owner_id=r.owner_id and m.active and lower(u.email)='gaexp8213@gmail.com' and u.email_confirmed_at is not null and u.raw_app_meta_data->>'provider'='google' and md5(c.envelope)=r.binding and c.data->>'verified'='true') then raise exception 'Administrator binding changed';end if;
 if r.project_id is null then
 if jsonb_typeof(payload->'surveys') is distinct from 'array' or jsonb_array_length(payload->'surveys') not between 1 and 1000 then raise exception 'Invalid catalogue';end if;
 insert into planner_private.survey_catalogue(singleton,data) values(true,payload) on conflict(singleton) do update set data=excluded.data,updated_at=now();
 else
 if jsonb_typeof(payload->'records') is distinct from 'array' or jsonb_array_length(payload->'records')>10000 then raise exception 'Invalid report rows';end if;
 update planner_private.survey_projects set result=payload||jsonb_build_object('sourceAt',now(),'start',r.start_day,'end',r.end_day,'configRevision',r.revision),updated_at=now() where id=r.project_id and revision=r.revision and not archived;
 if not found then raise exception 'Project changed during report loading' using errcode='40001';end if;
 end if;
 update planner_private.survey_requests set status='done',config=null,token=null,lease_until=null,updated_at=now() where id=r.id;return jsonb_build_object('done',true);
end;$$;
revoke all on function public.planner_survey_projects(text,uuid,jsonb,bigint),public.planner_survey_request(uuid,uuid),public.planner_survey_status(uuid) from public,anon;
grant execute on function public.planner_survey_projects(text,uuid,jsonb,bigint),public.planner_survey_request(uuid,uuid),public.planner_survey_status(uuid) to authenticated;
revoke all on function public.planner_survey_worker(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.planner_survey_worker(text,uuid,uuid,jsonb) to service_role;
commit;
