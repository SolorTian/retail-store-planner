-- Empty first-login credential drafts are not existing company bindings.
create or replace function public.planner_link_pending_visitor(profile uuid,member uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p planner_private.pending_visitors%rowtype;
begin
 if not coalesce(planner_private.active_user(),false) or not coalesce(planner_private.is_admin(),false) then raise exception 'Primary administrator required' using errcode='42501';end if;
 select * into p from planner_private.pending_visitors where id=profile for update;
 if not found or p.status='disabled' then raise exception 'Pending visitor unavailable';end if;
 if p.linked_to is not null and p.linked_to<>member then raise exception 'Already linked';end if;
 perform 1 from public.planner_members m join auth.users u on u.id=m.id where m.id=member and m.active and u.email_confirmed_at is not null and u.raw_app_meta_data->>'provider'='google' for update of m;
 if not found then raise exception 'Verified active Google member required' using errcode='42501';end if;
 perform 1 from public.planner_credentials c where c.owner_id=member for update;
 if exists(select 1 from public.planner_credentials c where c.owner_id=member and nullif(btrim(c.account_label),'') is not null and lower(btrim(c.account_label))<>lower(btrim(p.account_label))) then raise exception 'Company account differs';end if;
 if exists(select 1 from planner_private.pending_visitors q where q.id<>profile and q.linked_to=member and q.status='linked') then raise exception 'Google member already linked';end if;
 update planner_private.pending_visitors set linked_to=member,status='linked',linked_at=coalesce(linked_at,now()) where id=profile;
 if p.last_snapshot is not null then perform planner_private.apply_daily_snapshot(member,p.last_snapshot);end if;
 -- The trusted daily worker re-encrypts the company credential for this Google UID.
 return jsonb_build_object('status','linked','bindingReady',exists(select 1 from public.planner_credentials c where c.owner_id=member and c.data->>'verified'='true' and lower(btrim(c.account_label))=lower(btrim(p.account_label))));
end;$$;
revoke all on function public.planner_link_pending_visitor(uuid,uuid) from public,anon;
grant execute on function public.planner_link_pending_visitor(uuid,uuid) to authenticated;