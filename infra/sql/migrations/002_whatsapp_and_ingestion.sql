create table if not exists whatsapp_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  label text,
  account_phone_e164 text,
  account_phone_normalized text,
  account_jid text unique,
  display_name text,
  connection_status text not null default 'new' check (
    connection_status in ('new', 'qr_required', 'pairing', 'connected', 'reconnecting', 'disconnected', 'error', 'logged_out', 'banned')
  ),
  session_version integer not null default 1,
  last_connected_at timestamptz,
  last_disconnected_at timestamptz,
  last_sync_cursor text,
  health_score numeric(5,2),
  created_by uuid references organization_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'whatsapp_accounts'
      and column_name = 'status'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_name = 'whatsapp_accounts'
      and column_name = 'connection_status'
  ) then
    alter table whatsapp_accounts rename column status to connection_status;
  end if;
end $$;

alter table whatsapp_accounts
  add column if not exists label text,
  add column if not exists account_phone_e164 text,
  add column if not exists account_phone_normalized text,
  add column if not exists account_jid text,
  add column if not exists display_name text,
  add column if not exists connection_status text,
  add column if not exists session_version integer not null default 1,
  add column if not exists last_connected_at timestamptz,
  add column if not exists last_disconnected_at timestamptz,
  add column if not exists last_sync_cursor text,
  add column if not exists health_score numeric(5,2),
  add column if not exists created_by uuid references organization_users(id),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'whatsapp_accounts'
      and column_name = 'name'
  ) then
    execute '
      update whatsapp_accounts
      set label = coalesce(label, name)
    ';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'whatsapp_accounts'
      and column_name = 'phone_number'
  ) and exists (
    select 1
    from information_schema.columns
    where table_name = 'whatsapp_accounts'
      and column_name = 'phone_number_normalized'
  ) then
    execute '
      update whatsapp_accounts
      set account_phone_e164 = coalesce(account_phone_e164, phone_number),
          account_phone_normalized = coalesce(account_phone_normalized, phone_number_normalized)
    ';
  end if;
end $$;

update whatsapp_accounts
set display_name = coalesce(display_name, label),
    connection_status = coalesce(connection_status, 'new')
where connection_status is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'whatsapp_accounts_connection_status_check'
  ) then
    alter table whatsapp_accounts
      add constraint whatsapp_accounts_connection_status_check
      check (
        connection_status in ('new', 'qr_required', 'pairing', 'connected', 'reconnecting', 'disconnected', 'error', 'logged_out', 'banned')
      );
  end if;
end $$;

create unique index if not exists idx_whatsapp_accounts_account_jid_unique
  on whatsapp_accounts (account_jid)
  where account_jid is not null;

create table if not exists whatsapp_account_sessions (
  id uuid primary key default gen_random_uuid(),
  whatsapp_account_id uuid not null references whatsapp_accounts(id) on delete cascade,
  started_at timestamptz,
  ended_at timestamptz,
  end_reason text,
  reconnect_attempt_count integer not null default 0,
  qr_generated_at timestamptz,
  connected_at timestamptz,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists whatsapp_connection_events (
  id uuid primary key default gen_random_uuid(),
  whatsapp_account_id uuid not null references whatsapp_accounts(id) on delete cascade,
  session_id uuid references whatsapp_account_sessions(id) on delete set null,
  event_type text not null,
  severity text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists raw_channel_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  whatsapp_account_id uuid not null references whatsapp_accounts(id) on delete cascade,
  source text not null default 'whatsapp',
  event_type text not null,
  external_event_id text,
  event_timestamp timestamptz,
  received_at timestamptz not null default now(),
  payload jsonb not null,
  processing_status text not null default 'pending' check (processing_status in ('pending', 'processing', 'processed', 'failed', 'ignored')),
  retry_count integer not null default 0,
  error_message text
);

create table if not exists processed_event_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  source text not null,
  event_key text not null unique,
  processed_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_accounts_org_status
  on whatsapp_accounts (organization_id, connection_status);

create index if not exists idx_raw_events_pending
  on raw_channel_events (processing_status, received_at);

create index if not exists idx_raw_events_account_time
  on raw_channel_events (whatsapp_account_id, event_timestamp desc);

drop trigger if exists whatsapp_accounts_set_updated_at on whatsapp_accounts;
create trigger whatsapp_accounts_set_updated_at
before update on whatsapp_accounts
for each row execute function set_updated_at();
