create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  display_name text,
  primary_phone_e164 text,
  primary_phone_normalized text,
  primary_avatar_url text,
  profile_quality_score integer not null default 0,
  is_verified boolean not null default false,
  is_anchor_locked boolean not null default false,
  anchored_at timestamptz,
  anchored_by_source text,
  lifecycle_status text not null default 'lead' check (lifecycle_status in ('lead', 'customer', 'inactive', 'blocked')),
  owner_user_id uuid references organization_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'contacts'
      and column_name = 'phone_primary'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_name = 'contacts'
      and column_name = 'primary_phone_e164'
  ) then
    alter table contacts rename column phone_primary to primary_phone_e164;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'contacts'
      and column_name = 'phone_primary_normalized'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_name = 'contacts'
      and column_name = 'primary_phone_normalized'
  ) then
    alter table contacts rename column phone_primary_normalized to primary_phone_normalized;
  end if;
end $$;

alter table contacts
  add column if not exists display_name text,
  add column if not exists primary_phone_e164 text,
  add column if not exists primary_phone_normalized text,
  add column if not exists primary_avatar_url text,
  add column if not exists profile_quality_score integer not null default 0,
  add column if not exists is_verified boolean not null default false,
  add column if not exists is_anchor_locked boolean not null default false,
  add column if not exists anchored_at timestamptz,
  add column if not exists anchored_by_source text,
  add column if not exists lifecycle_status text not null default 'lead',
  add column if not exists owner_user_id uuid references organization_users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_activity_at timestamptz;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'contacts'
      and column_name = 'notes'
  ) then
    execute '
      update contacts
      set lifecycle_status = coalesce(lifecycle_status, ''lead'')
      where lifecycle_status is null
    ';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contacts_lifecycle_status_check'
  ) then
    alter table contacts
      add constraint contacts_lifecycle_status_check
      check (lifecycle_status in ('lead', 'customer', 'inactive', 'blocked'));
  end if;
end $$;

create table if not exists contact_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  channel text not null check (channel in ('whatsapp')),
  whatsapp_account_id uuid references whatsapp_accounts(id) on delete set null,
  external_identity text,
  phone_e164 text,
  phone_normalized text,
  wa_jid text,
  profile_name text,
  profile_push_name text,
  profile_avatar_url text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  confidence_score numeric(5,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, channel, wa_jid)
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'contact_identities'
      and column_name = 'whatsapp_jid'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_name = 'contact_identities'
      and column_name = 'wa_jid'
  ) then
    alter table contact_identities rename column whatsapp_jid to wa_jid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'contact_identities'
      and column_name = 'phone_number'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_name = 'contact_identities'
      and column_name = 'phone_e164'
  ) then
    alter table contact_identities rename column phone_number to phone_e164;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'contact_identities'
      and column_name = 'phone_number_normalized'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_name = 'contact_identities'
      and column_name = 'phone_normalized'
  ) then
    alter table contact_identities rename column phone_number_normalized to phone_normalized;
  end if;
end $$;

alter table contact_identities
  add column if not exists channel text,
  add column if not exists whatsapp_account_id uuid references whatsapp_accounts(id) on delete set null,
  add column if not exists external_identity text,
  add column if not exists phone_e164 text,
  add column if not exists phone_normalized text,
  add column if not exists wa_jid text,
  add column if not exists profile_name text,
  add column if not exists profile_push_name text,
  add column if not exists profile_avatar_url text,
  add column if not exists first_seen_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists is_primary boolean not null default false,
  add column if not exists is_active boolean not null default true,
  add column if not exists confidence_score numeric(5,2),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update contact_identities
set channel = coalesce(channel, 'whatsapp')
where channel is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contact_identities_channel_check'
  ) then
    alter table contact_identities
      add constraint contact_identities_channel_check
      check (channel in ('whatsapp'));
  end if;
end $$;

create table if not exists contact_owners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  organization_user_id uuid not null references organization_users(id) on delete cascade,
  owner_type text not null default 'primary' check (owner_type in ('primary', 'secondary', 'viewer')),
  created_at timestamptz not null default now(),
  unique (contact_id, organization_user_id)
);

create table if not exists contact_merge_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  source_contact_id uuid not null references contacts(id) on delete cascade,
  target_contact_id uuid not null references contacts(id) on delete cascade,
  reason text,
  merged_by text,
  created_at timestamptz not null default now()
);

create table if not exists merge_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  candidate_contact_id_1 uuid not null references contacts(id) on delete cascade,
  candidate_contact_id_2 uuid not null references contacts(id) on delete cascade,
  confidence_score numeric(5,2),
  reason jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists idx_contacts_org_phone
  on contacts (organization_id, primary_phone_normalized);

create index if not exists idx_contacts_org_last_activity
  on contacts (organization_id, last_activity_at desc);

create index if not exists idx_contact_identities_org_phone
  on contact_identities (organization_id, phone_normalized);

drop trigger if exists contacts_set_updated_at on contacts;
create trigger contacts_set_updated_at
before update on contacts
for each row execute function set_updated_at();

drop trigger if exists contact_identities_set_updated_at on contact_identities;
create trigger contact_identities_set_updated_at
before update on contact_identities
for each row execute function set_updated_at();
