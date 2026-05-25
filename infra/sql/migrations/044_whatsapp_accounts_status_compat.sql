-- Compatibility patch for Campaign Safety pre-check.
-- Some older databases only have whatsapp_accounts.connection_status.
-- The pre-check currently also reads whatsapp_accounts.status, so keep this nullable
-- compatibility column until all queries are migrated to schema-safe lookups.

alter table if exists whatsapp_accounts
  add column if not exists status text;
