begin;
create or replace function public.planner_pending_snapshot(profile uuid,period text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p planner_private.pending_visitors%rowtype;
begin
 if not coalesce(planner_private.active_user(),false) or not coalesce(planner_private.is_admin(),false) then raise exception 'Active primary administrator required' using errcode='42501'; end if;
 if period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Invalid period'; end if;
 select * into p from planner_private.pending_visitors where id=profile and status='pending_google';
 if not found then raise exception 'Pending profile unavailable'; end if;
 return jsonb_build_object('id',p.id,'accountLabel',p.account_label,'updatedAt',p.last_source_at,'documents',
  coalesce((select jsonb_agg(d) from jsonb_array_elements(p.last_snapshot) d where
    d->>'bucket'='customers' or (d->>'bucket'='visits' and left(d->>'id',4)=left(period,4))
    or (d->>'bucket'='settings' and d->>'id'='customerMaster')
    or (d->>'bucket' in ('workRecords','workSnapshots') and left(d->>'id',7)=period)),'[]'::jsonb));
end; $$;
revoke all on function public.planner_pending_snapshot(uuid,text) from public,anon;
grant execute on function public.planner_pending_snapshot(uuid,text) to authenticated;
commit;
