-- Only official offset evidence is distributed; credentials and routes remain untouched.
begin;
create or replace function public.planner_apply_offsets(payload jsonb, source_at text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare person record; part text; period_start date; period_end date; rows jsonb; old_data jsonb; count_people integer:=0; count_rows integer:=0; is_manager boolean;
begin
 if not planner_private.active_user() then raise exception 'Active Google account required' using errcode='42501'; end if;
 is_manager:=planner_private.is_admin();
 if payload->>'version' is distinct from '1' or payload->>'thresholdMeters' is distinct from '400' or payload->>'monthlyLimit' is distinct from '10'
  or jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items')>100000
  or source_at is null or length(source_at)>80 then raise exception 'Invalid offset snapshot'; end if;
 period_start:=(payload->>'start')::date;period_end:=(payload->>'end')::date;
 if period_start is null or period_end is null or period_start<>(period_end-interval '2 months')::date then raise exception 'Invalid offset range'; end if;
 if exists(select 1 from jsonb_array_elements(payload->'items') x where
  jsonb_typeof(x) is distinct from 'object' or x->>'id' is null or x->>'day' is null or x->>'type' is null or x->>'time' is null or x->>'owner' is null or x->>'name' is null or x->>'meters' is null
  or x->>'id' !~ '^[a-f0-9]{32}$' or x->>'day' !~ '^\d{4}-\d{2}-\d{2}$' or (x->>'day')::date not between period_start and period_end
  or x->>'type' not in ('到站打卡','離站打卡') or x->>'time' !~ '^\d{2}:\d{2}:\d{2}$'
  or jsonb_typeof(x->'meters')<>'number' or (x->>'meters')::numeric<=400 or (x->>'meters')::numeric>40000000
  or length(coalesce(x->>'owner',''))>300 or length(coalesce(x->>'name',''))>300) then raise exception 'Invalid offset evidence'; end if;
 for person in select m.id, split_part(c.account_label,'@',1) as staff,
  coalesce((select x->>'owner' from jsonb_array_elements(payload->'items') x where substring(x->>'owner' from '-([0-9]{4,12})$')=split_part(c.account_label,'@',1) order by x->>'day' desc,x->>'time' desc limit 1),nullif(master.data->>'preferredOwner',''),c.account_label) as owner
  from public.planner_members m join public.planner_credentials c on c.owner_id=m.id
  left join public.planner_documents master on master.owner_id=m.id and master.bucket='settings' and master.document_id='customerMaster'
  where m.active and (is_manager or m.id=auth.uid()) and c.account_label ~ '^[0-9]{4,12}@ttl[.]com$' and c.data->>'verified'='true'
 loop
  for part in select to_char(d,'YYYY-MM') from generate_series(date_trunc('month',period_start),date_trunc('month',period_end),interval '1 month') d
  loop
   select data into old_data from public.planner_documents where owner_id=person.id and bucket='work' and document_id='offsets_'||part;
   if old_data->>'staff' is distinct from person.staff then old_data:=null; end if;
   select coalesce(jsonb_agg(jsonb_build_object('id',x->>'id','day',x->>'day','type',x->>'type','time',x->>'time','name',x->>'name','owner',x->>'owner','channel',x->>'channel','meters',x->'meters') order by x->>'day',x->>'time',x->>'id'),'[]'::jsonb) into rows
   from (select distinct on (x->>'id') x from (
    select x from jsonb_array_elements(payload->'items') x where substring(x->>'owner' from '-([0-9]{4,12})$')=person.staff and left(x->>'day',7)=part
    union all select x from jsonb_array_elements(coalesce(old_data->'items','[]'::jsonb)) x where (x->>'day')::date not between period_start and period_end
   ) merged order by x->>'id') a;
   insert into public.planner_documents(owner_id,bucket,document_id,data) values(person.id,'work','offsets_'||part,
    jsonb_build_object('version',1,'period',part,'sourceAt',source_at,'rangeStart',least(period_start,coalesce((old_data->>'rangeStart')::date,period_start)),'rangeEnd',greatest(period_end,coalesce((old_data->>'rangeEnd')::date,period_end)),'freshStart',period_start,'freshEnd',period_end,'thresholdMeters',400,'monthlyLimit',10,'owner',person.owner,'staff',person.staff,'items',rows))
   on conflict(owner_id,bucket,document_id) do update set data=excluded.data,revision=public.planner_documents.revision+1,updated_at=now();
   count_rows:=count_rows+jsonb_array_length(rows);
  end loop;
  count_people:=count_people+1;
 end loop;
 if count_people=0 then raise exception 'No current responsible staff binding'; end if;
 return jsonb_build_object('people',count_people,'records',count_rows);
end;
$$;
revoke all on function public.planner_apply_offsets(jsonb,text) from public,anon;
grant execute on function public.planner_apply_offsets(jsonb,text) to authenticated;
commit;
