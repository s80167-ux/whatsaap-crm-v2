create table if not exists email_senders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  sender_type text not null check (sender_type in ('smtp', 'gmail', 'microsoft365')),
  display_name text not null,
  from_name text not null,
  from_email text not null,
  reply_to_email text null,
  smtp_host text null,
  smtp_port integer null,
  smtp_secure boolean not null default true,
  smtp_username text null,
  smtp_password_encrypted text null,
  oauth_provider text null,
  oauth_account_email text null,
  oauth_access_token_encrypted text null,
  oauth_refresh_token_encrypted text null,
  status text not null default 'draft' check (status in ('draft', 'verified', 'failed', 'disabled')),
  last_test_status text null,
  last_test_error text null,
  last_test_at timestamptz null,
  created_by_user_id uuid null references organization_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists email_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  subject text not null,
  body_html text not null,
  body_text text null,
  sender_id uuid not null references email_senders(id) on delete restrict,
  audience_group_id uuid null references campaign_audience_groups(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'paused', 'failed', 'cancelled')),
  scheduled_at timestamptz null,
  started_at timestamptz null,
  completed_at timestamptz null,
  cancelled_at timestamptz null,
  created_by_user_id uuid null references organization_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  campaign_id uuid not null references email_campaigns(id) on delete cascade,
  contact_id uuid null references contacts(id) on delete set null,
  email text not null,
  name text null,
  status text not null default 'pending' check (status in ('pending', 'skipped', 'sending', 'sent', 'failed', 'unsubscribed', 'bounced')),
  failure_code text null,
  failure_reason text null,
  provider_message_id text null,
  unsubscribe_token_id uuid null,
  sent_at timestamptz null,
  opened_at timestamptz null,
  clicked_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (campaign_id, email)
);

create table if not exists email_suppression_list (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  reason text not null check (reason in ('unsubscribed', 'bounced', 'complaint', 'manual')),
  source text null,
  note text null,
  created_by_user_id uuid null references organization_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists email_suppression_list_org_email_lower_unique
  on email_suppression_list (organization_id, lower(email));

create table if not exists email_unsubscribe_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  campaign_id uuid null references email_campaigns(id) on delete cascade,
  recipient_id uuid null references email_campaign_recipients(id) on delete cascade,
  email text not null,
  token text not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  used_at timestamptz null
);

create table if not exists email_send_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  campaign_id uuid null references email_campaigns(id) on delete cascade,
  recipient_id uuid null references email_campaign_recipients(id) on delete cascade,
  sender_id uuid null references email_senders(id) on delete set null,
  event_type text not null check (event_type in ('queued', 'sent', 'failed', 'unsubscribed', 'bounced', 'opened', 'clicked')),
  provider_response jsonb null,
  error_message text null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_email_senders_org_created
  on email_senders (organization_id, created_at desc);

create index if not exists idx_email_campaigns_org_status
  on email_campaigns (organization_id, status, created_at desc);

create index if not exists idx_email_campaign_recipients_campaign_status
  on email_campaign_recipients (campaign_id, status, created_at asc);

create index if not exists idx_email_campaign_recipients_org_email
  on email_campaign_recipients (organization_id, lower(email));

create index if not exists idx_email_unsubscribe_tokens_token
  on email_unsubscribe_tokens (token);

create index if not exists idx_email_send_events_campaign_created
  on email_send_events (campaign_id, created_at desc);

drop trigger if exists email_senders_set_updated_at on email_senders;
create trigger email_senders_set_updated_at
before update on email_senders
for each row execute function set_updated_at();

drop trigger if exists email_campaigns_set_updated_at on email_campaigns;
create trigger email_campaigns_set_updated_at
before update on email_campaigns
for each row execute function set_updated_at();