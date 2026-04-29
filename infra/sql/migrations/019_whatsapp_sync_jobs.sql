create table if not exists whatsapp_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  whatsapp_account_id uuid not null references whatsapp_accounts(id) on delete cascade,
  requested_by uuid references organization_users(id) on delete set null,
  job_type text not null,
  lookback_days integer,
  status text not null default 'queued',
  raw_events_received integer not null default 0,
  messages_processed integer not null default 0,
  conversations_updated integer not null default 0,
  contacts_processed integer not null default 0,
  failed_events integer not null default 0,
  last_activity_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table whatsapp_sync_jobs
  add constraint whatsapp_sync_jobs_job_type_check
  check (job_type in ('contacts_sync', 'history_backfill', 'full_sync'));

alter table whatsapp_sync_jobs
  add constraint whatsapp_sync_jobs_status_check
  check (status in ('queued', 'running', 'receiving_events', 'processing_events', 'idle', 'completed', 'failed', 'cancelled'));

create index if not exists idx_whatsapp_sync_jobs_org_created
  on whatsapp_sync_jobs (organization_id, created_at desc);

create index if not exists idx_whatsapp_sync_jobs_account_status
  on whatsapp_sync_jobs (whatsapp_account_id, status, created_at desc);

drop trigger if exists whatsapp_sync_jobs_set_updated_at on whatsapp_sync_jobs;
create trigger whatsapp_sync_jobs_set_updated_at
before update on whatsapp_sync_jobs
for each row execute function set_updated_at();
