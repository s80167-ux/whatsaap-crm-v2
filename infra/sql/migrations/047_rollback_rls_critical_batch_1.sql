-- ============================================
-- Rollback: 047_rollback_rls_critical_batch_1
-- Reverts ONLY the changes introduced by 047_rls_critical_batch_1.sql
-- Safe to run: does not drop tables, does not delete data,
-- and does not affect unrelated policies.
-- ============================================

-- ============================================================
-- 0. Remove index added by 047
-- ============================================================
drop index if exists idx_org_users_auth_user;

-- ============================================================
-- 1. whatsapp_accounts
--    Revert RLS enablement and all policies added by 047.
--    (whatsapp_accounts had no RLS and no policies before 047.)
-- ============================================================
drop policy if exists whatsapp_accounts_select_policy on whatsapp_accounts;
drop policy if exists whatsapp_accounts_insert_policy on whatsapp_accounts;
drop policy if exists whatsapp_accounts_update_policy on whatsapp_accounts;
drop policy if exists whatsapp_accounts_delete_policy on whatsapp_accounts;

alter table if exists whatsapp_accounts disable row level security;

-- ============================================================
-- 2. organization_users
--    Drop only the policies added by 047.
--    (RLS was already enabled before 047; do NOT disable it.)
-- ============================================================
drop policy if exists organization_users_select_policy on organization_users;
drop policy if exists organization_users_insert_policy on organization_users;
drop policy if exists organization_users_update_policy on organization_users;
drop policy if exists organization_users_delete_policy on organization_users;

-- ============================================================
-- 3. contacts
--    Drop only the INSERT/UPDATE/DELETE policies added by 047.
--    (contacts_select_policy from migration 005 is preserved.)
-- ============================================================
drop policy if exists contacts_insert_policy on contacts;
drop policy if exists contacts_update_policy on contacts;
drop policy if exists contacts_delete_policy on contacts;

-- ============================================================
-- 4. conversations
--    Drop only the INSERT/UPDATE/DELETE policies added by 047.
--    (conversations_select_policy from migration 005 is preserved.)
-- ============================================================
drop policy if exists conversations_insert_policy on conversations;
drop policy if exists conversations_update_policy on conversations;
drop policy if exists conversations_delete_policy on conversations;

-- ============================================================
-- 5. messages
--    Drop only the INSERT/UPDATE/DELETE policies added by 047.
--    (messages_select_policy from migration 005 is preserved.)
-- ============================================================
drop policy if exists messages_insert_policy on messages;
drop policy if exists messages_update_policy on messages;
drop policy if exists messages_delete_policy on messages;

-- ============================================================
-- 6. organizations
--    Drop only the INSERT/UPDATE/DELETE policies added by 047.
--    (organizations_select_policy from migration 005 is preserved.)
-- ============================================================
drop policy if exists organizations_insert_policy on organizations;
drop policy if exists organizations_update_policy on organizations;
drop policy if exists organizations_delete_policy on organizations;
