create table if not exists inbox_thread_summary (
  conversation_id uuid primary key references conversations(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  whatsapp_account_id uuid references whatsapp_accounts(id) on delete set null,
  contact_id uuid not null references contacts(id) on delete cascade,
  contact_display_name text,
  contact_primary_phone text,
  contact_avatar_url text,
  assigned_user_id uuid references organization_users(id) on delete set null,
  last_message_preview text,
  last_message_type text,
  last_message_direction text,
  last_message_at timestamptz,
  unread_count integer not null default 0,
  pinned boolean not null default false,
  muted boolean not null default false,
  thread_status text,
  updated_at timestamptz not null default now()
);

alter table inbox_thread_summary
  add column if not exists whatsapp_account_id uuid references whatsapp_accounts(id) on delete set null,
  add column if not exists contact_id uuid references contacts(id) on delete cascade,
  add column if not exists contact_display_name text,
  add column if not exists contact_primary_phone text,
  add column if not exists contact_avatar_url text,
  add column if not exists assigned_user_id uuid references organization_users(id) on delete set null,
  add column if not exists last_message_preview text,
  add column if not exists last_message_type text,
  add column if not exists last_message_direction text,
  add column if not exists last_message_at timestamptz,
  add column if not exists unread_count integer not null default 0,
  add column if not exists pinned boolean not null default false,
  add column if not exists muted boolean not null default false,
  add column if not exists thread_status text,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists contact_summary (
  contact_id uuid primary key references contacts(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  display_name text,
  primary_phone text,
  avatar_url text,
  total_conversations integer not null default 0,
  total_messages integer not null default 0,
  last_incoming_at timestamptz,
  last_outgoing_at timestamptz,
  last_activity_at timestamptz,
  lead_status text,
  owner_user_id uuid references organization_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table contact_summary
  add column if not exists display_name text,
  add column if not exists primary_phone text,
  add column if not exists avatar_url text,
  add column if not exists total_conversations integer not null default 0,
  add column if not exists total_messages integer not null default 0,
  add column if not exists last_incoming_at timestamptz,
  add column if not exists last_outgoing_at timestamptz,
  add column if not exists last_activity_at timestamptz,
  add column if not exists lead_status text,
  add column if not exists owner_user_id uuid references organization_users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists dashboard_metrics_daily (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  metric_date date not null,
  total_contacts integer not null default 0,
  active_contacts integer not null default 0,
  open_conversations integer not null default 0,
  messages_incoming integer not null default 0,
  messages_outgoing integer not null default 0,
  new_leads integer not null default 0,
  won_sales numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (organization_id, metric_date)
);

alter table dashboard_metrics_daily
  add column if not exists total_contacts integer not null default 0,
  add column if not exists active_contacts integer not null default 0,
  add column if not exists open_conversations integer not null default 0,
  add column if not exists messages_incoming integer not null default 0,
  add column if not exists messages_outgoing integer not null default 0,
  add column if not exists new_leads integer not null default 0,
  add column if not exists won_sales numeric(12,2) not null default 0,
  add column if not exists created_at timestamptz not null default now();

create index if not exists idx_inbox_summary_org_last
  on inbox_thread_summary (organization_id, last_message_at desc);

create index if not exists idx_inbox_summary_org_assigned_last
  on inbox_thread_summary (organization_id, assigned_user_id, last_message_at desc);

create or replace function is_platform_super_admin(p_auth_user_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from platform_super_admins psa
    where psa.auth_user_id = p_auth_user_id
  );
$$;

create or replace function current_org_user_id()
returns uuid
language sql
stable
as $$
  select ou.id
  from organization_users ou
  where ou.auth_user_id = auth.uid()
  limit 1;
$$;

alter table organizations enable row level security;
alter table organization_users enable row level security;
alter table contacts enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table inbox_thread_summary enable row level security;

drop policy if exists organizations_select_policy on organizations;
create policy organizations_select_policy on organizations
for select
using (
  is_platform_super_admin(auth.uid())
  or id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists contacts_select_policy on contacts;
create policy contacts_select_policy on contacts
for select
using (
  is_platform_super_admin(auth.uid())
  or organization_id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists conversations_select_policy on conversations;
create policy conversations_select_policy on conversations
for select
using (
  is_platform_super_admin(auth.uid())
  or organization_id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists messages_select_policy on messages;
create policy messages_select_policy on messages
for select
using (
  is_platform_super_admin(auth.uid())
  or organization_id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists inbox_thread_summary_select_policy on inbox_thread_summary;
create policy inbox_thread_summary_select_policy on inbox_thread_summary
for select
using (
  is_platform_super_admin(auth.uid())
  or organization_id in (
    select organization_id
    from organization_users
    where auth_user_id = auth.uid()
  )
);

drop trigger if exists inbox_thread_summary_set_updated_at on inbox_thread_summary;
create trigger inbox_thread_summary_set_updated_at
before update on inbox_thread_summary
for each row execute function set_updated_at();

drop trigger if exists contact_summary_set_updated_at on contact_summary;
create trigger contact_summary_set_updated_at
before update on contact_summary
for each row execute function set_updated_at();
