alter table campaigns
  add column if not exists sender_mode text not null default 'single';

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_name = 'campaigns'
      and constraint_name = 'campaigns_sender_mode_check'
  ) then
    alter table campaigns drop constraint campaigns_sender_mode_check;
  end if;

  alter table campaigns
    add constraint campaigns_sender_mode_check
    check (sender_mode in ('single', 'round_robin'));
end $$;

create table if not exists campaign_sender_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  whatsapp_account_id uuid not null references whatsapp_accounts(id) on delete cascade,
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  daily_limit_override integer null,
  min_delay_seconds_override integer null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (campaign_id, whatsapp_account_id)
);

create index if not exists campaign_sender_accounts_campaign_enabled_idx
  on campaign_sender_accounts (campaign_id, is_enabled, sort_order, created_at, id);

create index if not exists campaign_sender_accounts_org_campaign_idx
  on campaign_sender_accounts (organization_id, campaign_id);

do $$
begin
  if exists (
    select 1
    from pg_proc
    where proname = 'set_updated_at'
  ) and not exists (
    select 1
    from pg_trigger
    where tgname = 'campaign_sender_accounts_set_updated_at'
  ) then
    create trigger campaign_sender_accounts_set_updated_at
    before update on campaign_sender_accounts
    for each row execute function set_updated_at();
  end if;
end $$;

insert into campaign_sender_accounts (
  organization_id,
  campaign_id,
  whatsapp_account_id,
  is_enabled,
  sort_order
)
select
  c.organization_id,
  c.id,
  c.sender_whatsapp_account_id,
  true,
  0
from campaigns c
where c.sender_whatsapp_account_id is not null
on conflict (campaign_id, whatsapp_account_id) do nothing;

alter table campaign_recipients
  add column if not exists assigned_whatsapp_account_id uuid null references whatsapp_accounts(id) on delete set null,
  add column if not exists sender_assignment_reason text null,
  add column if not exists sender_assignment_index integer null,
  add column if not exists sender_assigned_at timestamptz null;

create index if not exists campaign_recipients_assignment_idx
  on campaign_recipients (campaign_id, assigned_whatsapp_account_id, send_status, created_at);

alter table message_dispatch_outbox
  add column if not exists source text not null default 'manual',
  add column if not exists priority integer not null default 5,
  add column if not exists available_at timestamptz null;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_name = 'message_dispatch_outbox'
      and constraint_name = 'message_dispatch_outbox_source_check'
  ) then
    alter table message_dispatch_outbox drop constraint message_dispatch_outbox_source_check;
  end if;

  alter table message_dispatch_outbox
    add constraint message_dispatch_outbox_source_check
    check (source in ('manual', 'quick_reply', 'campaign', 'system'));
end $$;

create index if not exists idx_message_dispatch_outbox_priority_due
  on message_dispatch_outbox (processing_status, priority desc, available_at, next_attempt_at, created_at);