begin;
-- Return only account labels, never encrypted bindings or passwords.
create or replace function public.planner_account_directory()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(planner_private.is_admin(),false) then
  raise exception 'Active primary administrator required' using errcode='42501';
 end if;
 return coalesce((select jsonb_agg(r order by r->>'name',r->>'email') from (
  select jsonb_build_object('uid',m.id,'name',coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name',u.email),
   'email',u.email,'accountLabel',coalesce(c.account_label,''),'active',m.active,
   'verified',coalesce((c.data->>'verified')::boolean,false),'kind','member') r
  from public.planner_members m join auth.users u on u.id=m.id
  left join public.planner_credentials c on c.owner_id=m.id
  union all
  select jsonb_build_object('uid',p.id,'name','待連結訪員','email','','accountLabel',p.account_label,
   'active',p.status<>'disabled','verified',false,'kind',p.status)
  from planner_private.pending_visitors p where p.linked_to is null
 ) directory),'[]'::jsonb);
end; $$;
revoke all on function public.planner_account_directory() from public,anon;
grant execute on function public.planner_account_directory() to authenticated;
commit;
