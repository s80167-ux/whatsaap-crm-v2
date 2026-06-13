alter table if exists whatsapp_accounts
  add column if not exists last_connection_error_code text,
  add column if not exists last_connection_error_message text,
  add column if not exists reconnect_failure_count integer not null default 0,
  add column if not exists ban_suspected_at timestamptz,
  add column if not exists reconnect_suppressed_at timestamptz;

create index if not exists idx_whatsapp_accounts_connection_status
  on whatsapp_accounts (connection_status);

create index if not exists idx_whatsapp_accounts_ban_suspected_at
  on whatsapp_accounts (ban_suspected_at)
  where ban_suspected_at is not null;

create index if not exists idx_whatsapp_accounts_reconnect_suppressed_at
  on whatsapp_accounts (reconnect_suppressed_at)
  where reconnect_suppressed_at is not null;
