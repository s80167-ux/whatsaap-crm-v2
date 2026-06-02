create table if not exists auto_reply_settings (
  organization_id uuid primary key references organizations(id) on delete cascade,
  is_enabled boolean not null default false,
  quick_reply_template_id uuid null references quick_reply_templates(id) on delete set null,
  timezone text not null default 'Asia/Kuala_Lumpur',
  business_hours_enabled boolean not null default true,
  business_hours_start time not null default '09:00',
  business_hours_end time not null default '18:00',
  business_days int[] not null default array[1,2,3,4,5],
  outside_hours_enabled boolean not null default true,
  no_reply_enabled boolean not null default false,
  no_reply_delay_minutes int not null default 30 check (no_reply_delay_minutes between 1 and 1440),
  first_message_enabled boolean not null default false,
  cooldown_minutes int not null default 240 check (cooldown_minutes between 0 and 10080),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists auto_reply_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  whatsapp_account_id uuid not null references whatsapp_accounts(id) on delete cascade,
  inbound_message_id uuid not null references messages(id) on delete cascade,
  outbound_message_id uuid null references messages(id) on delete set null,
  quick_reply_template_id uuid not null references quick_reply_templates(id) on delete restrict,
  trigger_type text not null check (trigger_type in ('outside_hours', 'no_reply', 'first_message')),
  status text not null default 'queued' check (status in ('queued', 'sent', 'skipped', 'failed')),
  scheduled_for timestamptz null,
  metadata jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, inbound_message_id, trigger_type)
);

create index if not exists idx_auto_reply_settings_template
  on auto_reply_settings (quick_reply_template_id);

create index if not exists idx_auto_reply_events_org_conversation_created
  on auto_reply_events (organization_id, conversation_id, created_at desc);

drop trigger if exists auto_reply_settings_set_updated_at on auto_reply_settings;
create trigger auto_reply_settings_set_updated_at
before update on auto_reply_settings
for each row execute function set_updated_at();

drop trigger if exists auto_reply_events_set_updated_at on auto_reply_events;
create trigger auto_reply_events_set_updated_at
before update on auto_reply_events
for each row execute function set_updated_at();
