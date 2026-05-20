create table if not exists campaign_safety_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade unique,
  whatsapp_daily_limit integer not null default 500,
  per_account_daily_limit integer not null default 300,
  send_rate_per_minute integer not null default 10,
  min_delay_seconds integer not null default 5,
  max_delay_seconds integer not null default 20,
  auto_pause_enabled boolean not null default true,
  auto_pause_failure_rate numeric not null default 0.25,
  auto_pause_min_sent integer not null default 20,
  recent_contact_cooldown_hours integer not null default 0,
  require_opt_out_text boolean not null default true,
  block_high_spam_risk boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists contact_communication_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid null references contacts(id) on delete set null,
  normalized_phone text not null,
  channel text not null default 'whatsapp',
  status text not null check (status in ('allowed', 'opted_out', 'blocked')),
  reason text null,
  source text null,
  created_by_user_id uuid null references organization_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, channel, normalized_phone)
);

create table if not exists campaign_safety_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  warning_codes jsonb not null default '[]'::jsonb,
  note text null,
  created_by_user_id uuid null references organization_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table campaigns
  add column if not exists safety_status text null,
  add column if not exists safety_score integer null,
  add column if not exists safety_checked_at timestamptz null,
  add column if not exists safety_summary jsonb null,
  add column if not exists pause_reason text null;

alter table campaign_recipients
  add column if not exists validation_status text not null default 'valid',
  add column if not exists validation_reason text null,
  add column if not exists normalized_phone text null,
  add column if not exists excluded_at timestamptz null,
  add column if not exists excluded_reason text null,
  add column if not exists failure_code text null,
  add column if not exists failure_reason text null,
  add column if not exists last_attempt_at timestamptz null,
  add column if not exists safety_exclusion_reason text null;

update campaign_recipients
set normalized_phone = coalesce(normalized_phone, phone_normalized)
where normalized_phone is null;

create index if not exists idx_campaign_safety_settings_org
  on campaign_safety_settings (organization_id);

create index if not exists idx_contact_comm_prefs_org_channel_phone
  on contact_communication_preferences (organization_id, channel, normalized_phone);

create index if not exists idx_campaign_safety_overrides_campaign
  on campaign_safety_overrides (organization_id, campaign_id, created_at desc);

create index if not exists idx_campaign_recipients_safety
  on campaign_recipients (organization_id, campaign_id, validation_status, send_status);

drop trigger if exists campaign_safety_settings_set_updated_at on campaign_safety_settings;
create trigger campaign_safety_settings_set_updated_at
before update on campaign_safety_settings
for each row execute function set_updated_at();

drop trigger if exists contact_communication_preferences_set_updated_at on contact_communication_preferences;
create trigger contact_communication_preferences_set_updated_at
before update on contact_communication_preferences
for each row execute function set_updated_at();
