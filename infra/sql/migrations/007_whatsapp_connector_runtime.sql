alter table whatsapp_accounts
  add column if not exists connector_owner_id text,
  add column if not exists connector_claimed_at timestamptz,
  add column if not exists connector_heartbeat_at timestamptz;

create index if not exists idx_whatsapp_accounts_connector_owner
  on whatsapp_accounts (connector_owner_id, connector_heartbeat_at desc);
