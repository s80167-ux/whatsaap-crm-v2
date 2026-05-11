grant select on conversations to authenticated;
grant select on messages to authenticated;
grant select on notifications to authenticated;

create or replace function is_platform_super_admin(p_auth_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from platform_super_admins psa
    where psa.auth_user_id = p_auth_user_id
  );
$$;

create or replace function current_org_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ou.id
  from organization_users ou
  where ou.auth_user_id = auth.uid()
    and ou.status = 'active'
  limit 1;
$$;

create or replace function current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ou.organization_id
  from organization_users ou
  where ou.auth_user_id = auth.uid()
    and ou.status = 'active'
  limit 1;
$$;

create or replace function current_org_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select ou.role
  from organization_users ou
  where ou.auth_user_id = auth.uid()
    and ou.status = 'active'
  limit 1;
$$;

grant execute on function is_platform_super_admin(uuid) to authenticated;
grant execute on function current_org_user_id() to authenticated;
grant execute on function current_organization_id() to authenticated;
grant execute on function current_org_user_role() to authenticated;

alter table notifications enable row level security;

drop policy if exists notifications_select_policy on notifications;
create policy notifications_select_policy
on notifications
for select
to authenticated
using (
  is_platform_super_admin(auth.uid())
  or (
    organization_id = current_organization_id()
    and (
      current_org_user_role() = 'org_admin'
      or recipient_user_id = auth.uid()
      or recipient_org_user_id = current_org_user_id()
    )
  )
);

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversations'
  ) then
    execute 'alter publication supabase_realtime add table public.conversations';
  end if;

  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;

  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;
