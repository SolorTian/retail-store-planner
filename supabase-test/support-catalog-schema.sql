-- Only planning fields are shared. Existing document and credential RLS remain intact.
begin;
create or replace function public.planner_support_customers(search_term text default '',page_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not planner_private.active_user() then raise exception 'Active Google account required' using errcode='42501'; end if;
 if length(coalesce(search_term,''))>180 or page_offset<0 or page_offset>100000 then raise exception 'Invalid search'; end if;
 with candidates as (
  select d.data,d.updated_at,
   row_number() over(partition by d.data->>'code' order by
    (coalesce(d.data->>'owner','') !~ '^\d*$') desc,d.updated_at desc,d.owner_id) as position
  from public.planner_documents d
  join public.planner_members m on m.id=d.owner_id and m.active
  join public.planner_documents master on master.owner_id=d.owner_id and master.bucket='settings' and master.document_id='customerMaster'
  where d.bucket='customers' and coalesce(d.data->>'code','')<>'' and coalesce(d.data->>'name','')<>''
  and coalesce(d.data->>'companyCurrent','true')<>'false'
  and jsonb_typeof(master.data->'codes')='array' and (master.data->'codes') ? (d.data->>'code')
  and not exists(select 1 from public.planner_documents closed join public.planner_members cm on cm.id=closed.owner_id and cm.active where
   closed.bucket='settings' and closed.document_id='closedStores'
   and jsonb_typeof(closed.data->'codes')='array' and (closed.data->'codes') ? (d.data->>'code'))
 ), current_customers as (
  select data,updated_at from candidates where position=1
  and regexp_replace(coalesce(data->>'status',''),'\s','','g') not like '%結束營業%'
 ), matched as (
  select data,updated_at from current_customers
  where coalesce(search_term,'')='' or strpos(lower(concat_ws(' ',data->>'name',data->>'code',data->>'owner',data->>'channel')),lower(search_term))>0
 ), selected as (
  select data,updated_at from matched order by data->>'name',data->>'code' offset page_offset limit 80
 )
 select jsonb_build_object('total',(select count(*) from matched),'items',coalesce((select jsonb_agg(
  jsonb_build_object('code',data->>'code','name',data->>'name','owner',coalesce(data->>'owner',''),
   'channel',coalesce(data->>'channel',''),'gps',data->'gps') order by data->>'name',data->>'code') from selected),'[]'::jsonb)) into result;
 return result;
end; $$;
revoke all on function public.planner_support_customers(text,integer) from public,anon;
grant execute on function public.planner_support_customers(text,integer) to authenticated;
commit;
