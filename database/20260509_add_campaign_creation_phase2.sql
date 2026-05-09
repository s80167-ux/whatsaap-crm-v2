create extension if not exists pgcrypto;

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  status text not null default 'draft',
  audience_group_id uuid null references campaign_audience_groups(id) on delete set null,
  sender_whatsapp_account_id uuid null references whatsapp_accounts(id) on delete set null,
  message_template text null,
  speed_preset text not null default 'safe',
  delay_per_message_seconds integer not null default 12,
  batch_size integer not null default 20,
  batch_pause_seconds integer not null default 120,
  daily_limit integer not null default 300,
  stop_on_high_failure boolean not null default true,
  created_by uuid null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint campaigns_status_check check (status in ('draft', 'scheduled', 'sending', 'completed', 'failed')),
  constraint campaigns_speed_preset_check check (speed_preset in ('safe', 'normal', 'custom')),
  constraint campaigns_tempo_positive_check check (
    delay_per_message_seconds > 0
    and batch_size > 0
    and batch_pause_seconds > 0
    and daily_limit > 0
  )
);

create table if not exists campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  audience_group_contact_id uuid null references campaign_audience_contacts(id) on delete set null,
  crm_contact_id uuid null references contacts(id) on delete set null,
  name text null,
  phone_normalized text not null,
  gender text not null default 'unknown',
  salutation text null,
  tag text null,
  location text null,
  product_interest text null,
  customer_type text null,
  notes text null,
  send_status text not null default 'pending',
  message_id uuid null references messages(id) on delete set null,
  attempt_count integer not null default 0,
  queued_at timestamptz null,
  sent_at timestamptz null,
  failed_at timestamptz null,
  next_attempt_at timestamptz null,
  error_message text null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint campaign_recipients_gender_check check (gender in ('male', 'female', 'unknown')),
  constraint campaign_recipients_send_status_check check (send_status in ('pending', 'queued', 'sent', 'failed', 'skipped'))
);

alter table campaign_recipients
  add column if not exists message_id uuid null references messages(id) on delete set null,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists queued_at timestamptz null,
  add column if not exists sent_at timestamptz null,
  add column if not exists failed_at timestamptz null,
  add column if not exists next_attempt_at timestamptz null;

create index if not exists campaigns_organization_id_idx
  on campaigns (organization_id);

create index if not exists campaigns_audience_group_id_idx
  on campaigns (audience_group_id);

create index if not exists campaigns_sender_whatsapp_account_id_idx
  on campaigns (sender_whatsapp_account_id);

create index if not exists campaign_recipients_organization_id_idx
  on campaign_recipients (organization_id);

create index if not exists campaign_recipients_campaign_id_idx
  on campaign_recipients (campaign_id);

create index if not exists campaign_recipients_phone_normalized_idx
  on campaign_recipients (phone_normalized);

create index if not exists campaign_recipients_dispatch_idx
  on campaign_recipients (campaign_id, send_status, next_attempt_at, created_at);

-- Phase 2 design note:
-- campaign_recipients should be snapshotted only when a campaign is scheduled or started,
-- not when an Audience Group is merely selected. This keeps recipient audit history stable
-- if the Audience Group changes before the campaign starts.

do $$
begin
  if exists (
    select 1
    from pg_proc
    where proname = 'set_updated_at'
  ) and not exists (
    select 1
    from pg_trigger
    where tgname = 'campaigns_set_updated_at'
  ) then
    create trigger campaigns_set_updated_at
    before update on campaigns
    for each row execute function set_updated_at();
  end if;
end $$;
