begin;
create table if not exists planner_private.admin_fuel_drafts(admin_id uuid not null references public.planner_members(id),target text not null,period text not null,data jsonb not null,updated_at timestamptz not null default now(),primary key(admin_id,target,period));
alter table planner_private.admin_fuel_drafts enable row level security;
revoke all on planner_private.admin_fuel_drafts from public,anon,authenticated;
create or replace function public.planner_admin_fuel(action text,target text default null,period text default null,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare directory jsonb;person jsonb;source jsonb;draft jsonb;binding jsonb;label text;staff text;
begin
 if not coalesce(planner_private.active_user(),false) or not coalesce(planner_private.is_admin(),false) then raise exception 'Primary administrator required' using errcode='42501';end if;
 directory:=public.planner_account_directory();
 if action='directory' then return coalesce((select jsonb_agg(jsonb_build_object('uid',p->>'uid','name',coalesce((select d.data->>'preferredOwner' from public.planner_documents d where d.owner_id::text=p->>'uid' and d.bucket='settings' and d.document_id='customerMaster'),p->>'name',p->>'accountLabel'),'accountLabel',p->>'accountLabel')) from jsonb_array_elements(directory) p where p->>'active'='true' and coalesce(p->>'accountLabel','')<>''),'[]'::jsonb)||jsonb_build_array(jsonb_build_object('uid','office:1502','name','營業所共用帳號','accountLabel','1502@ttl.com'));end if;
 if target='office:1502' then
  label:='1502@ttl.com';select jsonb_build_object('uid',owner_id,'envelope',envelope,'account',account) into binding from planner_private.shared_office_account where owner_id=auth.uid();
 else
  select p into person from jsonb_array_elements(directory) p where p->>'uid'=target and p->>'active'='true';
  if person is null then raise exception 'Visitor unavailable' using errcode='42501';end if;
  label:=person->>'accountLabel';
  select jsonb_build_object('uid',owner_id,'envelope',envelope,'account',account_label) into binding from public.planner_credentials where owner_id=target::uuid;
  if binding is null then select jsonb_build_object('uid',id,'envelope',envelope,'account',account_label) into binding from planner_private.pending_visitors where id=target::uuid and status='pending_google';end if;
 end if;
 if action='context' then if binding is null then raise exception 'Company account unavailable';end if;return binding;end if;
 if period is null or period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Invalid period';end if;
 if action='read' then
  if target='office:1502' then select data into source from planner_private.shared_office_reports r where r.account=label and r.period=planner_admin_fuel.period and kind='fuel';
  else
   select data into source from public.planner_documents where owner_id=target::uuid and bucket='settings' and document_id='fuel_'||period;
   if source is null then select j->'data' into source from planner_private.pending_visitors p cross join lateral jsonb_array_elements(coalesce(p.last_snapshot,'[]'::jsonb)) j where p.id=target::uuid and j->>'bucket'='settings' and j->>'id'='fuel_'||period;end if;
  end if;
  select data into draft from planner_private.admin_fuel_drafts d where d.admin_id=auth.uid() and d.target=planner_admin_fuel.target and d.period=planner_admin_fuel.period;
  staff:=split_part(label,'@',1);
  if source is not null and not (coalesce(source->'report'->>'owner','')=staff or right(coalesce(source->'report'->>'owner',''),length(staff)+1) in ('-'||staff,'－'||staff)) then source:=null;end if;
  if draft is not null and not (coalesce(draft->'report'->>'owner','')=staff or right(coalesce(draft->'report'->>'owner',''),length(staff)+1) in ('-'||staff,'－'||staff)) then draft:=null;end if;
  return jsonb_build_object('account',label,'draft',coalesce(draft,source),'source',source);
 elsif action='save' then
  staff:=split_part(label,'@',1);
  if coalesce(payload->'report'->>'period','')<>period or jsonb_typeof(payload->'report'->'items') is distinct from 'array' or length(payload::text)>1000000 or not (coalesce(payload->'report'->>'owner','')=staff or right(coalesce(payload->'report'->>'owner',''),length(staff)+1) in ('-'||staff,'－'||staff)) then raise exception 'Report owner or period mismatch';end if;
  insert into planner_private.admin_fuel_drafts(admin_id,target,period,data) values(auth.uid(),target,period,payload) on conflict on constraint admin_fuel_drafts_pkey do update set data=excluded.data,updated_at=now();return jsonb_build_object('saved',true);
 end if;
 raise exception 'Invalid action';
end;$$;
revoke all on function public.planner_admin_fuel(text,text,text,jsonb) from public,anon;
grant execute on function public.planner_admin_fuel(text,text,text,jsonb) to authenticated;
commit;

