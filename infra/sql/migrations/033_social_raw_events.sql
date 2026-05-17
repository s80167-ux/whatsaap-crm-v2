create table if not exists social_raw_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  social_channel_account_id uuid references social_channel_accounts(id) on delete cascade,
  source text not null check (source in ('facebook', 'instagram')),
  event_type text not null,
  external_event_id text,
  event_timestamp timestamptz,
  received_at timestamptz not null default now(),
  payload jsonb not null,
  processing_status text not null default 'pending' check (processing_status in ('pending', 'processing', 'processed', 'failed', 'ignored')),
  retry_count integer not null default 0 check (retry_count >= 0),
  error_message text
);

create index if not exists social_raw_events_processing_received_idx
  on social_raw_events (processing_status, received_at);

create index if not exists social_raw_events_org_source_timestamp_idx
  on social_raw_events (organization_id, source, event_timestamp desc);

create index if not exists social_raw_events_account_timestamp_idx
  on social_raw_events (social_channel_account_id, event_timestamp desc);

create table if not exists social_processed_event_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  source text not null,
  event_key text not null unique,
  processed_at timestamptz not null default now()
);

create index if not exists social_processed_event_keys_org_source_idx
  on social_processed_event_keys (organization_id, source, processed_at desc);
