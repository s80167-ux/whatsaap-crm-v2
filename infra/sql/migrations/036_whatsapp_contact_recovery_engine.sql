create table if not exists contact_enrichment_cache (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  whatsapp_account_id uuid not null references whatsapp_accounts(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  raw_jid text,
  normalized_jid text,
  lid text,
  phone_number text,
  best_display_name text,
  best_push_name text,
  best_verified_name text,
  best_notify_name text,
  best_profile_pic_url text,
  confidence_score int not null default 0,
  source text not null,
  raw_payload jsonb,
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_good_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, whatsapp_account_id, normalized_jid)
);

create index if not exists idx_contact_enrichment_cache_org_account
  on contact_enrichment_cache (organization_id, whatsapp_account_id);
create index if not exists idx_contact_enrichment_cache_normalized_jid
  on contact_enrichment_cache (normalized_jid);
create index if not exists idx_contact_enrichment_cache_phone
  on contact_enrichment_cache (phone_number);
create index if not exists idx_contact_enrichment_cache_contact
  on contact_enrichment_cache (contact_id);
create index if not exists idx_contact_enrichment_cache_last_good
  on contact_enrichment_cache (last_good_at desc);

drop trigger if exists contact_enrichment_cache_set_updated_at on contact_enrichment_cache;
create trigger contact_enrichment_cache_set_updated_at
before update on contact_enrichment_cache
for each row execute function set_updated_at();

create table if not exists wa_contact_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  whatsapp_account_id uuid not null references whatsapp_accounts(id) on delete cascade,
  raw_jid text not null,
  normalized_jid text,
  lid text,
  phone_number text,
  push_name text,
  verified_name text,
  notify_name text,
  profile_pic_url text,
  source text not null default 'baileys_snapshot',
  sync_type text,
  raw_payload jsonb,
  captured_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_wa_contact_snapshots_org_account
  on wa_contact_snapshots (organization_id, whatsapp_account_id);
create index if not exists idx_wa_contact_snapshots_normalized_jid
  on wa_contact_snapshots (normalized_jid);
create index if not exists idx_wa_contact_snapshots_phone
  on wa_contact_snapshots (phone_number);
create index if not exists idx_wa_contact_snapshots_captured
  on wa_contact_snapshots (captured_at desc);

create table if not exists wa_profile_fetch_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  whatsapp_account_id uuid not null references whatsapp_accounts(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  jid text not null,
  status text not null default 'pending',
  attempts int not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wa_profile_fetch_jobs_status_check'
  ) then
    alter table wa_profile_fetch_jobs
      add constraint wa_profile_fetch_jobs_status_check
      check (status in ('pending', 'processing', 'completed', 'failed'));
  end if;
end $$;

create index if not exists idx_wa_profile_fetch_jobs_org_account
  on wa_profile_fetch_jobs (organization_id, whatsapp_account_id);
create index if not exists idx_wa_profile_fetch_jobs_status_next
  on wa_profile_fetch_jobs (status, next_attempt_at);
create index if not exists idx_wa_profile_fetch_jobs_contact
  on wa_profile_fetch_jobs (contact_id);
create index if not exists idx_wa_profile_fetch_jobs_jid
  on wa_profile_fetch_jobs (jid);
create unique index if not exists wa_profile_fetch_jobs_pending_unique
  on wa_profile_fetch_jobs (organization_id, whatsapp_account_id, contact_id, jid)
  where status in ('pending', 'processing');

drop trigger if exists wa_profile_fetch_jobs_set_updated_at on wa_profile_fetch_jobs;
create trigger wa_profile_fetch_jobs_set_updated_at
before update on wa_profile_fetch_jobs
for each row execute function set_updated_at();

create table if not exists wa_contact_recovery_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  whatsapp_account_id uuid not null references whatsapp_accounts(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  action text not null,
  source text not null,
  confidence_score int,
  before_data jsonb,
  after_data jsonb,
  reason text,
  raw_payload jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_wa_contact_recovery_audit_org_account
  on wa_contact_recovery_audit_logs (organization_id, whatsapp_account_id);
create index if not exists idx_wa_contact_recovery_audit_contact
  on wa_contact_recovery_audit_logs (contact_id);
create index if not exists idx_wa_contact_recovery_audit_action
  on wa_contact_recovery_audit_logs (action);
create index if not exists idx_wa_contact_recovery_audit_created
  on wa_contact_recovery_audit_logs (created_at desc);
