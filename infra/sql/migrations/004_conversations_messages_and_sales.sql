create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  whatsapp_account_id uuid not null references whatsapp_accounts(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  external_thread_key text,
  thread_type text not null default 'direct' check (thread_type in ('direct', 'group', 'broadcast')),
  subject text,
  status text not null default 'open' check (status in ('open', 'closed', 'archived', 'spam')),
  assigned_user_id uuid references organization_users(id) on delete set null,
  first_message_at timestamptz,
  last_message_at timestamptz,
  last_incoming_at timestamptz,
  last_outgoing_at timestamptz,
  unread_count integer not null default 0,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, channel, whatsapp_account_id, external_thread_key)
);

alter table conversations
  add column if not exists channel text,
  add column if not exists external_thread_key text,
  add column if not exists thread_type text,
  add column if not exists subject text,
  add column if not exists assigned_user_id uuid references organization_users(id) on delete set null,
  add column if not exists first_message_at timestamptz,
  add column if not exists last_incoming_at timestamptz,
  add column if not exists last_outgoing_at timestamptz,
  add column if not exists last_read_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update conversations
set channel = coalesce(channel, 'whatsapp'),
    thread_type = coalesce(thread_type, 'direct')
where channel is null
   or thread_type is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_channel_check'
  ) then
    alter table conversations
      add constraint conversations_channel_check
      check (channel in ('whatsapp'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_thread_type_check'
  ) then
    alter table conversations
      add constraint conversations_thread_type_check
      check (thread_type in ('direct', 'group', 'broadcast'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_status_check'
  ) then
    alter table conversations
      add constraint conversations_status_check
      check (status in ('open', 'closed', 'archived', 'spam'));
  end if;
end $$;

create unique index if not exists idx_conversations_org_thread_unique
  on conversations (organization_id, channel, whatsapp_account_id, external_thread_key)
  where external_thread_key is not null;

create table if not exists conversation_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  organization_user_id uuid not null references organization_users(id) on delete cascade,
  assignment_type text not null default 'primary' check (assignment_type in ('primary', 'secondary', 'viewer')),
  assigned_at timestamptz not null default now(),
  unique (conversation_id, organization_user_id)
);

create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  source text,
  mime_type text,
  file_name text,
  file_size bigint,
  storage_bucket text,
  storage_path text,
  sha256 text,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  whatsapp_account_id uuid not null references whatsapp_accounts(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  channel text not null default 'whatsapp',
  direction text not null check (direction in ('incoming', 'outgoing', 'system')),
  external_message_id text,
  external_chat_id text,
  sender_identity text,
  recipient_identity text,
  message_type text not null default 'text' check (
    message_type in ('text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact', 'reaction', 'system')
  ),
  content_text text,
  content_json jsonb,
  media_id uuid references media_assets(id) on delete set null,
  reply_to_message_id uuid references messages(id) on delete set null,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  ack_status text not null default 'pending' check (ack_status in ('pending', 'server_ack', 'device_delivered', 'read', 'played', 'failed')),
  is_from_history_sync boolean not null default false,
  is_deleted boolean not null default false,
  is_edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (whatsapp_account_id, external_message_id)
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'messages'
      and column_name = 'raw_payload'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_name = 'messages'
      and column_name = 'content_json'
  ) then
    alter table messages rename column raw_payload to content_json;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'messages'
      and column_name = 'contact_identity_id'
  ) then
    alter table messages drop column if exists contact_identity_id;
  end if;
exception
  when undefined_column then
    null;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'messages'
      and column_name = 'direction'
  ) then
    alter table messages
      alter column direction type text
      using (
        case direction::text
          when 'inbound' then 'incoming'
          when 'outbound' then 'outgoing'
          else coalesce(direction::text, 'system')
        end
      );
  end if;
end $$;

alter table messages
  add column if not exists channel text,
  add column if not exists external_chat_id text,
  add column if not exists sender_identity text,
  add column if not exists recipient_identity text,
  add column if not exists content_json jsonb,
  add column if not exists media_id uuid references media_assets(id) on delete set null,
  add column if not exists reply_to_message_id uuid references messages(id) on delete set null,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists ack_status text not null default 'pending',
  add column if not exists is_from_history_sync boolean not null default false,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists is_edited boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'messages'
      and column_name = 'received_at'
  ) and exists (
    select 1
    from information_schema.columns
    where table_name = 'messages'
      and column_name = 'delivered_at'
  ) then
    execute '
      update messages
      set delivered_at = coalesce(delivered_at, received_at)
      where delivered_at is null
    ';
  end if;
end $$;

update messages
set channel = coalesce(channel, 'whatsapp'),
    ack_status = case
      when ack_status is not null then ack_status
      when read_at is not null then 'read'
      when delivered_at is not null then 'device_delivered'
      when failed_at is not null then 'failed'
      else 'pending'
    end
where channel is null
   or ack_status is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_direction_check'
  ) then
    alter table messages
      add constraint messages_direction_check
      check (direction in ('incoming', 'outgoing', 'system'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_channel_check'
  ) then
    alter table messages
      add constraint messages_channel_check
      check (channel in ('whatsapp'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_message_type_check'
  ) then
    alter table messages
      add constraint messages_message_type_check
      check (
        message_type in ('text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact', 'reaction', 'system')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_ack_status_check'
  ) then
    alter table messages
      add constraint messages_ack_status_check
      check (ack_status in ('pending', 'server_ack', 'device_delivered', 'read', 'played', 'failed'));
  end if;
end $$;

create table if not exists message_status_events (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  status text not null,
  event_at timestamptz not null default now(),
  payload jsonb
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  source text,
  status text not null default 'new_lead' check (status in ('new_lead', 'contacted', 'interested', 'processing', 'closed_won', 'closed_lost')),
  temperature text check (temperature in ('cold', 'warm', 'hot')),
  assigned_user_id uuid references organization_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table leads
  add column if not exists source text,
  add column if not exists temperature text,
  add column if not exists assigned_user_id uuid references organization_users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_status_check'
  ) then
    alter table leads
      add constraint leads_status_check
      check (status in ('new_lead', 'contacted', 'interested', 'processing', 'closed_won', 'closed_lost'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_temperature_check'
  ) then
    alter table leads
      add constraint leads_temperature_check
      check (temperature in ('cold', 'warm', 'hot'));
  end if;
end $$;

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  user_id uuid references organization_users(id) on delete set null,
  activity_type text not null,
  title text,
  notes text,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists sales_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  assigned_user_id uuid references organization_users(id) on delete set null,
  status text not null default 'open',
  total_amount numeric(12,2) not null default 0,
  currency text not null default 'MYR',
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table sales_orders
  add column if not exists lead_id uuid references leads(id) on delete set null,
  add column if not exists assigned_user_id uuid references organization_users(id) on delete set null,
  add column if not exists status text not null default 'open',
  add column if not exists total_amount numeric(12,2) not null default 0,
  add column if not exists currency text not null default 'MYR',
  add column if not exists closed_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists sales_order_items (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references sales_orders(id) on delete cascade,
  product_type text,
  package_name text,
  unit_price numeric(12,2) not null default 0,
  quantity integer not null default 1,
  total_price numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_conversations_org_last_message
  on conversations (organization_id, last_message_at desc);

create index if not exists idx_conversations_org_assigned_last
  on conversations (organization_id, assigned_user_id, last_message_at desc);

create index if not exists idx_messages_conversation_sent
  on messages (conversation_id, sent_at desc);

create index if not exists idx_messages_org_contact_sent
  on messages (organization_id, contact_id, sent_at desc);

drop trigger if exists conversations_set_updated_at on conversations;
create trigger conversations_set_updated_at
before update on conversations
for each row execute function set_updated_at();

drop trigger if exists messages_set_updated_at on messages;
create trigger messages_set_updated_at
before update on messages
for each row execute function set_updated_at();

drop trigger if exists leads_set_updated_at on leads;
create trigger leads_set_updated_at
before update on leads
for each row execute function set_updated_at();

drop trigger if exists sales_orders_set_updated_at on sales_orders;
create trigger sales_orders_set_updated_at
before update on sales_orders
for each row execute function set_updated_at();
