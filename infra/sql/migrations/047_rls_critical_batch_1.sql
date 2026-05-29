-- ============================================
-- Migration: 047_rls_critical_batch_1
-- Purpose: Enable and enforce row-level security
--          on the first critical batch of tenant tables.
-- Tables:  organizations, organization_users, contacts,
--          conversations, messages, whatsapp_accounts
-- ============================================

-- ============================================================
-- 0. INDEX: accelerate RLS org-membership subqueries
-- ============================================================
create index if not exists idx_org_users_auth_user
  on organization_users (auth_user_id);

-- ============================================================
-- 1. organizations
--    Current: RLS enabled. SELECT policy exists.
-- ============================================================

drop policy if exists organizations_insert_policy on organizations;
create policy organizations_insert_policy on organizations
for insert
to authenticated
with check (is_platform_super_admin(auth.uid()));

drop policy if exists organizations_update_policy on organizations;
create policy organizations_update_policy on organizations
for update
to authenticated
using (
  is_platform_super_admin(auth.uid())
  or id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
      and role = 'org_admin'
  )
)
with check (
  is_platform_super_admin(auth.uid())
  or id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
      and role = 'org_admin'
  )
);

drop policy if exists organizations_delete_policy on organizations;
create policy organizations_delete_policy on organizations
for delete
to authenticated
using (is_platform_super_admin(auth.uid()));

-- ============================================================
-- 2. organization_users
--    Current: RLS enabled. ZERO policies exist.
--    Replaces requested "profiles" + "organization_members".
-- ============================================================

drop policy if exists organization_users_select_policy on organization_users;
create policy organization_users_select_policy on organization_users
for select
to authenticated
using (
  is_platform_super_admin(auth.uid())
  or auth_user_id = auth.uid()
  or organization_id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists organization_users_insert_policy on organization_users;
create policy organization_users_insert_policy on organization_users
for insert
to authenticated
with check (
  is_platform_super_admin(auth.uid())
  or organization_id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
  )
);

-- UPDATE restricted to self-only for regular users.
-- Admin team-management goes through REST API (raw SQL), so this is safe.
drop policy if exists organization_users_update_policy on organization_users;
create policy organization_users_update_policy on organization_users
for update
to authenticated
using (
  is_platform_super_admin(auth.uid())
  or auth_user_id = auth.uid()
)
with check (
  is_platform_super_admin(auth.uid())
  or auth_user_id = auth.uid()
);

drop policy if exists organization_users_delete_policy on organization_users;
create policy organization_users_delete_policy on organization_users
for delete
to authenticated
using (
  is_platform_super_admin(auth.uid())
  or auth_user_id = auth.uid()
);

-- ============================================================
-- 3. contacts
--    Current: RLS enabled. SELECT policy exists.
-- ============================================================

drop policy if exists contacts_insert_policy on contacts;
create policy contacts_insert_policy on contacts
for insert
to authenticated
with check (
  is_platform_super_admin(auth.uid())
  or organization_id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists contacts_update_policy on contacts;
create policy contacts_update_policy on contacts
for update
to authenticated
using (
  is_platform_super_admin(auth.uid())
  or organization_id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
  )
)
with check (
  is_platform_super_admin(auth.uid())
  or organization_id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists contacts_delete_policy on contacts;
create policy contacts_delete_policy on contacts
for delete
to authenticated
using (
  is_platform_super_admin(auth.uid())
  or organization_id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
  )
);

-- ============================================================
-- 4. conversations
--    Current: RLS enabled. SELECT policy exists.
-- ============================================================

drop policy if exists conversations_insert_policy on conversations;
create policy conversations_insert_policy on conversations
for insert
to authenticated
with check (
  is_platform_super_admin(auth.uid())
  or organization_id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists conversations_update_policy on conversations;
create policy conversations_update_policy on conversations
for update
to authenticated
using (
  is_platform_super_admin(auth.uid())
  or organization_id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
  )
)
with check (
  is_platform_super_admin(auth.uid())
  or organization_id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists conversations_delete_policy on conversations;
create policy conversations_delete_policy on conversations
for delete
to authenticated
using (
  is_platform_super_admin(auth.uid())
  or organization_id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
  )
);

-- ============================================================
-- 5. messages
--    Current: RLS enabled. SELECT policy exists.
-- ============================================================

drop policy if exists messages_insert_policy on messages;
create policy messages_insert_policy on messages
for insert
to authenticated
with check (
  is_platform_super_admin(auth.uid())
  or organization_id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists messages_update_policy on messages;
create policy messages_update_policy on messages
for update
to authenticated
using (
  is_platform_super_admin(auth.uid())
  or organization_id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
  )
)
with check (
  is_platform_super_admin(auth.uid())
  or organization_id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists messages_delete_policy on messages;
create policy messages_delete_policy on messages
for delete
to authenticated
using (
  is_platform_super_admin(auth.uid())
  or organization_id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
  )
);

-- ============================================================
-- 6. whatsapp_accounts
--    Current: RLS NOT enabled. No policies exist.
-- ============================================================
alter table whatsapp_accounts enable row level security;

drop policy if exists whatsapp_accounts_select_policy on whatsapp_accounts;
create policy whatsapp_accounts_select_policy on whatsapp_accounts
for select
to authenticated
using (
  is_platform_super_admin(auth.uid())
  or organization_id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists whatsapp_accounts_insert_policy on whatsapp_accounts;
create policy whatsapp_accounts_insert_policy on whatsapp_accounts
for insert
to authenticated
with check (
  is_platform_super_admin(auth.uid())
  or organization_id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists whatsapp_accounts_update_policy on whatsapp_accounts;
create policy whatsapp_accounts_update_policy on whatsapp_accounts
for update
to authenticated
using (
  is_platform_super_admin(auth.uid())
  or organization_id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
  )
)
with check (
  is_platform_super_admin(auth.uid())
  or organization_id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists whatsapp_accounts_delete_policy on whatsapp_accounts;
create policy whatsapp_accounts_delete_policy on whatsapp_accounts
for delete
to authenticated
using (
  is_platform_super_admin(auth.uid())
  or organization_id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
  )
);
