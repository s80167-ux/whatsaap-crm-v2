-- ============================================
-- Migration: 048_super_admin_rls_hardening
-- Purpose: Harden super_admin access path after 047 RLS migration.
--          Ensures platform_super_admins table is accessible and
--          is_platform_super_admin() is SECURITY DEFINER.
-- ============================================

-- 1. Ensure is_platform_super_admin is SECURITY DEFINER with safe search_path.
--    This is critical: without SECURITY DEFINER, the function runs as the
--    authenticated role inside RLS policies and may return false if
--    platform_super_admins lacks a SELECT policy.
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

-- 2. Grant execute to authenticated so RLS policies can call it.
grant execute on function is_platform_super_admin(uuid) to authenticated;

-- 3. Ensure platform_super_admins does NOT have RLS enabled.
--    It is a small lookup table; RLS on it adds unnecessary fragility.
alter table if exists platform_super_admins disable row level security;

-- 4. Add an unconditional self-select policy on organization_users.
--    This ensures every authenticated user can always see their own row,
--    even if is_platform_super_admin() ever fails or the user has no org.
drop policy if exists organization_users_select_self_policy on organization_users;
create policy organization_users_select_self_policy on organization_users
for select
to authenticated
using (auth_user_id = auth.uid());

-- 5. Ensure organizations SELECT allows org membership lookup.
--    This is a belt-and-suspenders policy for normal users.
drop policy if exists organizations_select_membership_policy on organizations;
create policy organizations_select_membership_policy on organizations
for select
to authenticated
using (
  id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
  )
);
