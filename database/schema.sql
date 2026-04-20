create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('super_admin', 'admin', 'user', 'agent');
  end if;

  if not exists (select 1 from pg_type where typname = 'message_direction') then
    create type message_direction as enum ('inbound', 'outbound');
  end if;
end $$;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,
  email text not null unique,
  full_name text,
  password_hash text not null,
  role user_role not null default 'user',
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table if not exists whatsapp_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  phone_number text,
  phone_number_normalized text,
  status text not null default 'disconnected',
  baileys_session_key text not null,
  auth_path text not null,
  last_connected_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  unique (organization_id, baileys_session_key)
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  display_name text,
  first_name text,
  last_name text,
  phone_primary text,
  phone_primary_normalized text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create unique index if not exists contacts_org_phone_primary_unique
  on contacts (organization_id, phone_primary_normalized)
  where phone_primary_normalized is not null and deleted_at is null;

create index if not exists contacts_org_created_idx
  on contacts (organization_id, created_at desc);

create table if not exists contact_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  whatsapp_account_id uuid references whatsapp_accounts(id) on delete cascade,
  whatsapp_jid text not null,
  phone_number text,
  phone_number_normalized text,
  last_seen_at timestamptz,
  raw_profile_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create unique index if not exists contact_identities_org_account_jid_unique
  on contact_identities (organization_id, whatsapp_account_id, whatsapp_jid)
  where deleted_at is null;

create unique index if not exists contact_identities_org_account_phone_unique
  on contact_identities (organization_id, whatsapp_account_id, phone_number_normalized)
  where phone_number_normalized is not null and deleted_at is null;

create index if not exists contact_identities_contact_idx
  on contact_identities (contact_id, created_at desc);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  whatsapp_account_id uuid not null references whatsapp_accounts(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  last_message_id uuid,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count integer not null default 0,
  status text not null default 'open',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  unique (organization_id, whatsapp_account_id, contact_id)
);

create index if not exists conversations_org_last_message_idx
  on conversations (organization_id, last_message_at desc nulls last, updated_at desc);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  whatsapp_account_id uuid not null references whatsapp_accounts(id) on delete cascade,
  contact_identity_id uuid references contact_identities(id) on delete set null,
  external_message_id text not null,
  direction message_direction not null,
  message_type text not null default 'text',
  content_text text,
  raw_payload jsonb,
  sent_at timestamptz not null,
  received_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  unique (organization_id, whatsapp_account_id, external_message_id)
);

create index if not exists messages_conversation_sent_at_idx
  on messages (conversation_id, sent_at asc, id asc);

create index if not exists messages_org_account_sent_at_idx
  on messages (organization_id, whatsapp_account_id, sent_at desc);

alter table conversations
  add constraint conversations_last_message_fk
  foreign key (last_message_id) references messages(id) on delete set null;

drop trigger if exists organizations_set_updated_at on organizations;
create trigger organizations_set_updated_at before update on organizations
for each row execute function set_updated_at();

drop trigger if exists users_set_updated_at on users;
create trigger users_set_updated_at before update on users
for each row execute function set_updated_at();

drop trigger if exists whatsapp_accounts_set_updated_at on whatsapp_accounts;
create trigger whatsapp_accounts_set_updated_at before update on whatsapp_accounts
for each row execute function set_updated_at();

drop trigger if exists contacts_set_updated_at on contacts;
create trigger contacts_set_updated_at before update on contacts
for each row execute function set_updated_at();

drop trigger if exists contact_identities_set_updated_at on contact_identities;
create trigger contact_identities_set_updated_at before update on contact_identities
for each row execute function set_updated_at();

drop trigger if exists conversations_set_updated_at on conversations;
create trigger conversations_set_updated_at before update on conversations
for each row execute function set_updated_at();

drop trigger if exists messages_set_updated_at on messages;
create trigger messages_set_updated_at before update on messages
for each row execute function set_updated_at();
