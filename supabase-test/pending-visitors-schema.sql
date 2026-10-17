begin;
-- Company-only staff are profiles, never fabricated Google/auth accounts.
create table if not exists planner_private.pending_visitors(
 id uuid primary key,account_label text not null unique,envelope text not null,
 status text not null default 'pending_google' check(status in ('pending_google','linked','disabled')),
 linked_to uuid unique references public.planner_members(id),
 created_at timestamptz not null default now(),linked_at timestamptz,
 last_snapshot jsonb,last_source_at timestamptz
);
alter table planner_private.pending_visitors enable row level security;
revoke all on planner_private.pending_visitors from public,anon,authenticated;
create or replace function public.planner_pending_visitors()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(planner_private.is_admin(),false) then raise exception 'Primary administrator required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'accountLabel',account_label,'status',status,'linkedTo',linked_to,'updatedAt',last_source_at)) from planner_private.pending_visitors),'[]'::jsonb);
end; $$;
revoke all on function public.planner_pending_visitors() from public,anon;
grant execute on function public.planner_pending_visitors() to authenticated;
commit;

