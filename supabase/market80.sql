begin;
create table if not exists planner_private.market_entries80(
 id uuid primary key,period date not null,category text not null check(category in ('菸類','酒類','啤酒類')),
 data jsonb not null,revision integer not null default 1,created_by uuid not null,updated_by uuid not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz,
 check(extract(day from period)=1));
create index if not exists market_entries80_period on planner_private.market_entries80(period,created_at);
create table if not exists planner_private.market_template80(id boolean primary key default true check(id),bytes bytea not null,updated_at timestamptz not null default now());
revoke all on planner_private.market_entries80,planner_private.market_template80 from public,anon,authenticated;
alter table planner_private.market_entries80 enable row level security;
alter table planner_private.market_template80 enable row level security;
create or replace function public.planner_market80(action text,p_period text default null,p_id uuid default null,p_revision integer default null,p_data jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d date;r planner_private.market_entries80%rowtype;photo jsonb;name text;payload jsonb;blob bytea;
begin
 if not coalesce(planner_private.active_user(),false) then raise exception 'Active verified member required' using errcode='42501';end if;
 if action='template' then
  select jsonb_build_object('base64',encode(bytes,'base64'),'updatedAt',updated_at) into payload from planner_private.market_template80 where id;
  if payload is null then raise exception 'Excel template not configured';end if;return payload;
 elsif action='template_save' then
  if not coalesce(planner_private.is_admin(),false) then raise exception 'Primary administrator required' using errcode='42501';end if;
  if jsonb_typeof(p_data->'base64') is distinct from 'string' or length(p_data->>'base64')>1500000 then raise exception 'Invalid Excel template';end if;
  blob:=decode(p_data->>'base64','base64');
  if octet_length(blob)<1000 or octet_length(blob)>1000000 or substring(blob from 1 for 2)<>decode('504b','hex') then raise exception 'Invalid Excel template';end if;
  insert into planner_private.market_template80 values(true,blob,now()) on conflict(id) do update set bytes=excluded.bytes,updated_at=now();return jsonb_build_object('saved',true);
 end if;
 if action not in ('list','read','save','remove','restore') then raise exception 'Invalid action';end if;
 if p_period is null or p_period !~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$' then raise exception 'Invalid reporting month';end if;
 d:=(p_period||'-01')::date;
 if action='list' then
  return jsonb_build_object('entries',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at,e.id) from planner_private.market_entries80 e where e.period=d),'[]'::jsonb),'templateReady',exists(select 1 from planner_private.market_template80 where id),'serverAt',now());
 end if;
 if p_id is null then raise exception 'Entry ID required';end if;
 select * into r from planner_private.market_entries80 where id=p_id for update;
 if action='read' then if not found or r.period<>d then raise exception 'Entry not found';end if;return to_jsonb(r);end if;
 if p_revision is null or p_revision<0 then raise exception 'Revision required';end if;
 if r.id is not null and (r.period<>d or r.revision<>p_revision) or r.id is null and p_revision<>0 then raise exception 'Record changed; reload before saving' using errcode='40001';end if;
 if action in ('remove','restore') then
  if r.id is null then raise exception 'Entry not found';end if;
  update planner_private.market_entries80 set deleted_at=case when action='remove' then now() else null end,revision=revision+1,updated_by=auth.uid(),updated_at=now() where id=p_id returning * into r;return to_jsonb(r);
 end if;
 if r.deleted_at is not null then raise exception 'Entry removed; restore before saving' using errcode='40001';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>24000 then raise exception 'Invalid market report';end if;
 if coalesce(p_data->>'category','') not in ('菸類','酒類','啤酒類') or coalesce(p_data->>'channel','') not in ('傳統通路','菸鋪通路','啤鋪通路','菸酒專','CVS','連鎖超市','量販店') or coalesce(p_data->>'audience','') not in ('通路端','消費者端') or coalesce(p_data->>'collection','') not in ('新品(新裝)上市','促案活動','進貨獎勵','價格調整','陳列活動','季節性產品','神秘客活動','競品策略') then raise exception 'Invalid category';end if;
 if coalesce(p_data->>'source','') not in ('現場訪查','客戶提供','供應商／業務提供','網路／社群','廣告／傳單','其他') then raise exception 'Information source required';end if;
 if length(trim(coalesce(p_data->>'brand',''))) not between 1 and 100 or length(trim(coalesce(p_data->>'reporter',''))) not between 1 and 100 or length(trim(coalesce(p_data->>'store',''))) not between 1 and 200 or length(trim(coalesce(p_data->>'content',''))) not between 1 and 6000 or length(coalesce(p_data->>'sourceDetail',''))>1000 or length(coalesce(p_data->>'brandGroup',''))>100 then raise exception 'Required report fields missing or too long';end if;
 if coalesce(p_data->>'activityStart','')<>'' and (p_data->>'activityStart') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' or coalesce(p_data->>'activityEnd','')<>'' and (p_data->>'activityEnd') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid activity date';end if;
 if coalesce(p_data->>'activityStart','')<>'' then perform (p_data->>'activityStart')::date;end if;
 if coalesce(p_data->>'activityEnd','')<>'' then perform (p_data->>'activityEnd')::date;end if;
 if coalesce(p_data->>'activityStart','')<>'' and coalesce(p_data->>'activityEnd','')<>'' and p_data->>'activityStart'>p_data->>'activityEnd' then raise exception 'Activity dates reversed';end if;
 if jsonb_typeof(p_data->'photos') is distinct from 'array' or jsonb_array_length(p_data->'photos')>2 then raise exception 'At most two photos';end if;
 for photo in select value from jsonb_array_elements(p_data->'photos') loop
  if jsonb_typeof(photo) is distinct from 'object' or coalesce(photo->>'path','') !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' or not exists(select 1 from storage.objects o where o.bucket_id='market-evidence80' and o.name=photo->>'path') then raise exception 'Photo upload not confirmed';end if;
  if coalesce(photo->>'width','') !~ '^[0-9]{1,4}$' or coalesce(photo->>'height','') !~ '^[0-9]{1,4}$' or (photo->>'width')::int not between 1 and 1600 or (photo->>'height')::int not between 1 and 1600 then raise exception 'Invalid photo size';end if;
 end loop;
 select coalesce(nullif(raw_user_meta_data->>'full_name',''),email) into name from auth.users where id=auth.uid();
 payload:=jsonb_build_object('category',p_data->>'category','channel',p_data->>'channel','brand',trim(p_data->>'brand'),'brandGroup',coalesce(p_data->>'brandGroup',''),'audience',p_data->>'audience','collection',p_data->>'collection','activityStart',coalesce(p_data->>'activityStart',''),'activityEnd',coalesce(p_data->>'activityEnd',''),'store',trim(p_data->>'store'),'source',p_data->>'source','sourceDetail',coalesce(p_data->>'sourceDetail',''),'content',trim(p_data->>'content'),'reporter',trim(p_data->>'reporter'),'photos',p_data->'photos','editor',name);
 if r.id is null then
  insert into planner_private.market_entries80(id,period,category,data,created_by,updated_by) values(p_id,d,payload->>'category',payload,auth.uid(),auth.uid()) on conflict(id) do nothing returning * into r;
  if not found then raise exception 'Record changed; reload before saving' using errcode='40001';end if;
 else update planner_private.market_entries80 set category=payload->>'category',data=payload,revision=revision+1,updated_at=now(),updated_by=auth.uid() where id=p_id returning * into r;
 end if;return to_jsonb(r);
end;$$;
revoke all on function public.planner_market80(text,text,uuid,integer,jsonb) from public,anon;
grant execute on function public.planner_market80(text,text,uuid,integer,jsonb) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('market-evidence80','market-evidence80',false,2000000,array['image/jpeg']) on conflict(id) do nothing;
create or replace function public.planner_market_member80() returns boolean language sql stable security definer set search_path='' as $$select coalesce(planner_private.active_user(),false)$$;
revoke all on function public.planner_market_member80() from public,anon;
grant execute on function public.planner_market_member80() to authenticated;
drop policy if exists market80_read on storage.objects;
create policy market80_read on storage.objects for select to authenticated using(bucket_id='market-evidence80' and public.planner_market_member80());
drop policy if exists market80_insert on storage.objects;
create policy market80_insert on storage.objects for insert to authenticated with check(bucket_id='market-evidence80' and public.planner_market_member80() and name ~ ('^'||auth.uid()::text||'/[0-9a-f-]{36}\.jpg$'));
commit;
