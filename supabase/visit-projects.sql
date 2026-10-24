begin;
create table if not exists planner_private.visit_projects(
 id uuid primary key, name text not null, start_day date not null, end_day date not null,
 channel text not null, mode text not null, target integer not null,
 archived boolean not null default false, revision bigint not null default 1, updated_at timestamptz not null default now(),
 check(length(name) between 1 and 100),check(length(channel) between 1 and 120),
 check(end_day>=start_day and end_day-start_day<=365),check(mode in ('daily','weekdays','weekly','total')),check(target between 1 and 50)
);
alter table planner_private.visit_projects enable row level security;
revoke all on planner_private.visit_projects from public,anon,authenticated;
create or replace function public.planner_visit_projects() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(planner_private.is_admin(),false) then raise exception 'Primary administrator required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'start',start_day,'end',end_day,'channel',channel,'mode',mode,'target',target,'archived',archived,'revision',revision) order by start_day desc,name) from planner_private.visit_projects),'[]'::jsonb);
end; $$;
create or replace function public.planner_save_visit_project(payload jsonb, expected_revision bigint default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_revision bigint; project_id uuid:=(payload->>'id')::uuid;
begin
 if not coalesce(planner_private.is_admin(),false) then raise exception 'Primary administrator required' using errcode='42501'; end if;
 if project_id is null or jsonb_typeof(payload)<>'object' then raise exception 'Invalid project'; end if;
 perform pg_advisory_xact_lock(hashtextextended(project_id::text,0));
 select revision into current_revision from planner_private.visit_projects where id=project_id for update;
 if coalesce(current_revision,0)<>expected_revision then raise exception 'Project changed; reload before saving' using errcode='40001'; end if;
 if current_revision is null and (select count(*) from planner_private.visit_projects)>=100 then raise exception 'Project limit reached'; end if;
 insert into planner_private.visit_projects(id,name,start_day,end_day,channel,mode,target,archived)
 values(project_id,btrim(payload->>'name'),(payload->>'start')::date,(payload->>'end')::date,btrim(payload->>'channel'),payload->>'mode',(payload->>'target')::integer,coalesce((payload->>'archived')::boolean,false))
 on conflict(id) do update set name=excluded.name,start_day=excluded.start_day,end_day=excluded.end_day,channel=excluded.channel,mode=excluded.mode,target=excluded.target,archived=excluded.archived,revision=visit_projects.revision+1,updated_at=now();
 return public.planner_visit_projects();
end; $$;
revoke all on function public.planner_visit_projects() from public,anon;
revoke all on function public.planner_save_visit_project(jsonb,bigint) from public,anon;
grant execute on function public.planner_visit_projects(),public.planner_save_visit_project(jsonb,bigint) to authenticated;
commit;
