begin;
create or replace function public.planner_survey_data(action text,p_uid uuid default null,p_period text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare people jsonb;meta jsonb;items jsonb;n integer;
begin
 if not coalesce(planner_private.is_admin(),false) then raise exception 'Primary administrator required' using errcode='42501';end if;
 people:=public.planner_account_directory();
 if action='directory' then
 return jsonb_build_object('people',people,'stores',coalesce((select jsonb_agg(jsonb_build_object('uid',owner_id,'code',data->>'code','name',data->>'name','channel',coalesce(data->>'channel',data->>'group','未分類'),'owner',data->>'owner')) from (
 select d.owner_id,d.data from public.planner_documents d where d.bucket='customers' and d.data->>'companyCurrent' is distinct from 'false' and exists(select 1 from jsonb_array_elements(people) p where p->>'uid'=d.owner_id::text and p->>'active'='true')
 union all select p.id,j->'data' from planner_private.pending_visitors p cross join lateral jsonb_array_elements(case when jsonb_typeof(p.last_snapshot)='array' then p.last_snapshot else '[]'::jsonb end) j where p.status<>'disabled' and p.linked_to is null and j->>'bucket'='customers' and j->'data'->>'companyCurrent' is distinct from 'false'
 ) d where coalesce(data->>'code','')<>'' and coalesce(data->>'name','')<>''),'[]'::jsonb));
 end if;
 if action<>'work' or p_uid is null or coalesce(p_period,'')!~'^[0-9]{4}-(0[1-9]|1[0-2])$' or not exists(select 1 from jsonb_array_elements(people) p where p->>'uid'=p_uid::text and p->>'active'='true') then raise exception 'Invalid project work request';end if;
 with docs as(select bucket,document_id id,data from public.planner_documents where owner_id=p_uid union all select j->>'bucket',j->>'id',j->'data' from planner_private.pending_visitors p cross join lateral jsonb_array_elements(case when jsonb_typeof(p.last_snapshot)='array' then p.last_snapshot else '[]'::jsonb end) j where p.id=p_uid and p.status<>'disabled' and p.linked_to is null)
 select data into meta from docs where bucket='workSnapshots' and id=p_period limit 1;
 if meta is null or coalesce(meta->>'requestId','')!~'^[a-f0-9]{32}$' then return jsonb_build_object('complete',false,'items','[]'::jsonb);end if;
 with docs as(select bucket,document_id id,data from public.planner_documents where owner_id=p_uid union all select j->>'bucket',j->>'id',j->'data' from planner_private.pending_visitors p cross join lateral jsonb_array_elements(case when jsonb_typeof(p.last_snapshot)='array' then p.last_snapshot else '[]'::jsonb end) j where p.id=p_uid and p.status<>'disabled' and p.linked_to is null),chunks as(select data from docs where bucket='workRecords' and left(id,length(p_period||'_'||(meta->>'requestId')||'_'))=p_period||'_'||(meta->>'requestId')||'_')
 select (select count(*) from chunks),coalesce((select jsonb_agg(jsonb_build_object('id',j->>'id','code',j->>'code','name',j->>'name','checkInAt',j->>'checkInAt','subject',j->>'subject','workflow',j->'workflow','ownerUid',p_uid)) from chunks cross join lateral jsonb_array_elements(data->'items') j),'[]'::jsonb) into n,items;
 return jsonb_build_object('complete',n=(meta->>'chunks')::integer and jsonb_array_length(items)=(meta->>'count')::integer,'items',items,'updatedAt',meta->>'updatedAt');
end;$$;
revoke all on function public.planner_survey_data(text,uuid,text) from public,anon;
grant execute on function public.planner_survey_data(text,uuid,text) to authenticated;
create or replace function public.planner_survey_targets(request_id uuid,lease uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r planner_private.survey_requests%rowtype;ids uuid[];
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted worker required' using errcode='42501';end if;
 select * into r from planner_private.survey_requests where id=request_id and status='reading' and token=lease and lease_until>now();if not found then raise exception 'Report lease lost';end if;
 if not exists(select 1 from public.planner_credentials c join public.planner_members m on m.id=c.owner_id join auth.users u on u.id=m.id where c.owner_id=r.owner_id and m.active and lower(u.email)='gaexp8213@gmail.com' and u.email_confirmed_at is not null and u.raw_app_meta_data->>'provider'='google' and md5(c.envelope)=r.binding and c.data->>'verified'='true') then raise exception 'Primary administrator binding changed';end if;
 select array_agg(distinct coalesce(nullif(s->>'uid','')::uuid,r.owner_id)) into ids from jsonb_array_elements(r.config->'stores') s;
 return coalesce((select jsonb_agg(j) from (
 select jsonb_build_object('owner',c.owner_id,'envelope',c.envelope,'accountLabel',c.account_label) j from public.planner_credentials c join public.planner_members m on m.id=c.owner_id where c.owner_id=any(ids) and m.active and c.data->>'verified'='true'
 union all select jsonb_build_object('owner',p.id,'envelope',p.envelope,'accountLabel',p.account_label,'kind','pending_google') from planner_private.pending_visitors p where p.id=any(ids) and p.status<>'disabled' and p.linked_to is null
 ) bindings),'[]'::jsonb);
end;$$;
revoke all on function public.planner_survey_targets(uuid,uuid) from public,anon,authenticated;
grant execute on function public.planner_survey_targets(uuid,uuid) to service_role;
commit;
