create table if not exists social_channel_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  platform text not null check (platform in ('facebook', 'instagram')),
  label text not null,
  external_account_id text,
  external_account_name text,
  username text,
  profile_picture_url text,
  connection_status text not null default 'setup_pending' check (connection_status in ('new', 'setup_pending', 'connected', 'disconnected', 'error', 'token_expired')),
  webhook_status text not null default 'pending' check (webhook_status in ('pending', 'verified', 'active', 'failed')),
  token_expires_at timestamptz,
  last_sync_at timestamptz,
  created_by uuid references organization_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists social_channel_accounts_org_platform_idx
  on social_channel_accounts (organization_id, platform);

create index if not exists social_channel_accounts_org_connection_status_idx
  on social_channel_accounts (organization_id, connection_status);

create index if not exists social_channel_accounts_external_account_id_idx
  on social_channel_accounts (external_account_id)
  where external_account_id is not null;

create unique index if not exists social_channel_accounts_org_platform_external_account_id_uidx
  on social_channel_accounts (organization_id, platform, external_account_id)
  where external_account_id is not null;

drop trigger if exists social_channel_accounts_set_updated_at on social_channel_accounts;
create trigger social_channel_accounts_set_updated_at
before update on social_channel_accounts
for each row execute function set_updated_at();
