begin;
create table if not exists planner_private.shared_office_account(
 account text primary key check(account='1502@ttl.com'), owner_id uuid not null references public.planner_members(id),
 envelope text not null,updated_at timestamptz not null default now()
);
create table if not exists planner_private.shared_office_reports(
 account text not null references planner_private.shared_office_account(account),period text not null,
 kind text not null check(kind in ('work','fuel')),data jsonb not null,updated_at timestamptz not null default now(),primary key(account,period,kind)
);
alter table planner_private.shared_office_account enable row level security;
alter table planner_private.shared_office_reports enable row level security;
revoke all on planner_private.shared_office_account,planner_private.shared_office_reports from public,anon,authenticated;
create or replace function public.planner_shared_office(action text,period text default null,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(planner_private.active_user(),false) or not coalesce(planner_private.is_admin(),false) then raise exception 'Primary administrator required' using errcode='42501';end if;
 if action='binding' then
  if length(coalesce(payload->>'envelope','')) not between 500 and 12000 then raise exception 'Invalid encrypted credential';end if;
  insert into planner_private.shared_office_account(account,owner_id,envelope) values('1502@ttl.com',auth.uid(),payload->>'envelope') on conflict(account) do update set owner_id=excluded.owner_id,envelope=excluded.envelope,updated_at=now();
  return jsonb_build_object('configured',true);
 elsif action='status' then
  return jsonb_build_object('configured',exists(select 1 from planner_private.shared_office_account where owner_id=auth.uid()),'reports',coalesce((select jsonb_agg(jsonb_build_object('period',r.period,'kind',r.kind,'updatedAt',r.updated_at)) from planner_private.shared_office_reports r),'[]'::jsonb));
 end if;
 if period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or period is null then raise exception 'Invalid period';end if;
 if action='read' then
  return coalesce((select jsonb_object_agg(kind,jsonb_build_object('data',data,'updatedAt',updated_at)) from planner_private.shared_office_reports r where r.period=planner_shared_office.period),'{}'::jsonb);
 elsif action='save' then
  if payload->>'kind' not in ('work','fuel') or payload->'data' is null or octet_length(payload::text)>12000000 then raise exception 'Invalid report';end if;
  insert into planner_private.shared_office_reports(account,period,kind,data) values('1502@ttl.com',planner_shared_office.period,payload->>'kind',payload->'data') on conflict on constraint shared_office_reports_pkey do update set data=excluded.data,updated_at=now();
  return jsonb_build_object('saved',true);
 end if;
 raise exception 'Invalid action';
end;$$;
create or replace function public.planner_visit_context(shared boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not coalesce(planner_private.active_user(),false) then raise exception 'Active verified member required' using errcode='42501';end if;
 if shared then
  if not coalesce(planner_private.is_admin(),false) then raise exception 'Primary administrator required' using errcode='42501';end if;
  select jsonb_build_object('uid',owner_id,'envelope',envelope,'account','1502@ttl.com') into result from planner_private.shared_office_account where owner_id=auth.uid();
 else
  select jsonb_build_object('uid',owner_id,'envelope',envelope,'account',account_label) into result from public.planner_credentials where owner_id=auth.uid();
 end if;
 if result is null or coalesce(result->>'envelope','')='' then raise exception 'Company account not configured';end if;
 return result;
end;$$;
revoke all on function public.planner_shared_office(text,text,jsonb),public.planner_visit_context(boolean) from public,anon;
grant execute on function public.planner_shared_office(text,text,jsonb),public.planner_visit_context(boolean) to authenticated;
commit;

