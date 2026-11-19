begin;
create or replace function planner_private.survey_scope75(c jsonb,owner_uid uuid)
returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('range',c->>'range','start',case when c->>'range'='fixed' then c->>'start' end,'end',case when c->>'range'='fixed' then c->>'end' end,
 'surveys',(select jsonb_agg(s->>'id' order by s->>'id') from jsonb_array_elements(c->'surveys') s),
 'stores',(select jsonb_agg(jsonb_build_array(coalesce(s->>'uid',owner_uid::text),s->>'code') order by coalesce(s->>'uid',owner_uid::text),s->>'code') from jsonb_array_elements(c->'stores') s));
$$;
revoke all on function planner_private.survey_scope75(jsonb,uuid) from public,anon,authenticated;
create or replace function public.planner_survey_projects(action text,p_id uuid default null,p_payload jsonb default '{}'::jsonb,expected_revision bigint default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p planner_private.survey_projects%rowtype;c jsonb:=p_payload->'config';directory jsonb;
begin
 if not coalesce(planner_private.is_admin(),false) then raise exception 'Primary administrator required' using errcode='42501';end if;
 if action='list' then return jsonb_build_object('projects',coalesce((select jsonb_agg(jsonb_build_object('id',id,'config',config,'revision',revision,'archived',archived,'sourceAt',result->>'sourceAt') order by updated_at desc) from planner_private.survey_projects),'[]'::jsonb),'catalogue',(select data from planner_private.survey_catalogue where singleton),'catalogueAt',(select updated_at from planner_private.survey_catalogue where singleton));end if;
 if action='read' then select * into p from planner_private.survey_projects where id=p_id; if not found then raise exception 'Project unavailable';end if;return jsonb_build_object('id',p.id,'config',p.config,'revision',p.revision,'archived',p.archived,'result',p.result);end if;
 if action<>'save' or p_id is null then raise exception 'Invalid project action';end if;
 if jsonb_typeof(c) is distinct from 'object' or length(btrim(coalesce(c->>'name',''))) not between 1 and 100 or length(coalesce(c->>'keyword',''))>200 or coalesce(c->>'range','') not in ('recent2','fixed') or coalesce(c->>'requirePhotos','') not in ('true','false') then raise exception 'Invalid project settings';end if;
 if c ? 'checks' then
 if jsonb_typeof(c->'checks') is distinct from 'object' or jsonb_typeof(c#>'{checks,answers}') is distinct from 'boolean' or jsonb_typeof(c#>'{checks,photos}') is distinct from 'boolean' or jsonb_typeof(c#>'{checks,visits}') is distinct from 'number' or coalesce(c#>>'{checks,visits}','')!~'^(0|[1-9]|[12][0-9]|3[01])$' then raise exception 'Invalid monthly checks';end if;
 if c#>>'{checks,answers}'='false' and c#>>'{checks,photos}'='false' and c#>>'{checks,visits}'='0' then raise exception 'Select a monthly check';end if;
 end if;
 if jsonb_typeof(c->'stores') is distinct from 'array' or jsonb_array_length(c->'stores') not between 1 and 5000 or jsonb_typeof(c->'surveys') is distinct from 'array' or jsonb_array_length(c->'surveys') not between 0 and 8 then raise exception 'Select stores and questionnaires';end if;
 if jsonb_array_length(c->'surveys')=0 and (not(c ? 'checks') or c#>>'{checks,answers}'='true' or c#>>'{checks,photos}'='true') then raise exception 'Select questionnaires for answer or photo checks';end if;
 if exists(select 1 from jsonb_array_elements(c->'stores') x where length(coalesce(x->>'code','')) not between 1 and 150 or length(coalesce(x->>'name','')) not between 1 and 200) or exists(select 1 from jsonb_array_elements(c->'surveys') x where coalesce(x->>'id','')!~'^[0-9]{1,10}$' or length(coalesce(x->>'name','')) not between 1 and 200) then raise exception 'Invalid project targets';end if;
 if exists(select 1 from jsonb_array_elements(c->'stores') s where s ? 'uid') then
 directory:=public.planner_account_directory();
 if exists(select 1 from jsonb_array_elements(c->'stores') s where s ? 'uid' and (coalesce(s->>'uid','')!~'^[a-f0-9-]{36}$' or not exists(select 1 from jsonb_array_elements(directory) d where d->>'uid'=s->>'uid' and d->>'active'='true'))) then raise exception 'Invalid visitor target';end if;
 end if;
 if c->>'range'='fixed' and (coalesce(c->>'start','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(c->>'end','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then raise exception 'Date range required';end if;
 if c->>'range'='fixed' and ((c->>'start')::date>(c->>'end')::date or (c->>'end')::date-(c->>'start')::date>365) then raise exception 'Invalid date range';end if;

 if c ? 'cadence' and (coalesce(c#>>'{cadence,unit}','') not in ('month','week','day','project') or coalesce(c#>>'{cadence,every}','')!~'^([1-9]|[12][0-9]|3[01])$' or coalesce(c#>>'{cadence,anchor}','') not in ('project','calendar')) then raise exception 'Invalid project cadence';end if;
 if c ? 'answerCount' and coalesce(c->>'answerCount','')!~'^([1-9]|[12][0-9]|3[01])$' then raise exception 'Invalid answer count';end if;
 if c ? 'photoCount' and coalesce(c->>'photoCount','')!~'^([1-9][0-9]?|100)$' then raise exception 'Invalid photo count';end if;
 if c ? 'photoNaming' and (jsonb_typeof(c->'photoNaming') is distinct from 'object' or length(btrim(coalesce(c#>>'{photoNaming,template}',''))) not between 1 and 300 or exists(select 1 from regexp_matches(c#>>'{photoNaming,template}','\{([^{}]+)\}','g') token where token[1] not in ('date','store','tags','photoTime','photoDate','owner','project','survey','code','visitAt','reportedAt','seq'))) then raise exception 'Invalid photo filename template';end if;
 if exists(select 1 from jsonb_array_elements(c->'stores') s where s ? 'tags' and (jsonb_typeof(s->'tags') is distinct from 'array' or jsonb_array_length(s->'tags')>12)) then raise exception 'Invalid store hashtags';end if;
 perform pg_advisory_xact_lock(hashtextextended('survey-project:'||p_id::text,0));
 select * into p from planner_private.survey_projects where id=p_id for update;
 if found then if p.revision<>expected_revision then raise exception 'Project changed; reload' using errcode='40001';end if;update planner_private.survey_projects set result=case when result->>'configRevision'=p.revision::text and planner_private.survey_scope75(p.config,auth.uid())=planner_private.survey_scope75(c,auth.uid()) then jsonb_set(result,'{configRevision}',to_jsonb(p.revision+1)) else result end,config=c,archived=coalesce((p_payload->>'archived')::boolean,false),revision=revision+1,updated_at=now() where id=p_id returning * into p;
 else if expected_revision<>0 or (select count(*) from planner_private.survey_projects)>=100 then raise exception 'Project limit or revision conflict';end if;insert into planner_private.survey_projects(id,config) values(p_id,c) returning * into p;end if;
 return jsonb_build_object('id',p.id,'revision',p.revision);
end;$$;
commit;

