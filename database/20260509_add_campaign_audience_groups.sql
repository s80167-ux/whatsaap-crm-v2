create extension if not exists pgcrypto;

create table if not exists campaign_audience_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text null,
  source text not null default 'csv',
  status text not null default 'draft',
  total_rows integer not null default 0,
  valid_count integer not null default 0,
  invalid_count integer not null default 0,
  duplicate_count integer not null default 0,
  opt_out_count integer not null default 0,
  linked_crm_count integer not null default 0,
  created_by uuid null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint campaign_audience_groups_status_check check (status in ('draft', 'imported', 'failed')),
  constraint campaign_audience_groups_source_check check (source in ('csv'))
);

create table if not exists campaign_audience_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  audience_group_id uuid not null references campaign_audience_groups(id) on delete cascade,
  crm_contact_id uuid null references contacts(id) on delete set null,
  name text null,
  phone_raw text not null,
  phone_normalized text not null,
  gender text not null default 'unknown',
  salutation text null,
  tag text null,
  location text null,
  product_interest text null,
  customer_type text null,
  notes text null,
  validation_status text not null default 'valid',
  validation_issues jsonb not null default '[]'::jsonb,
  is_duplicate boolean not null default false,
  is_opted_out boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  constraint campaign_audience_contacts_gender_check check (gender in ('male', 'female', 'unknown')),
  constraint campaign_audience_contacts_validation_status_check check (validation_status in ('valid', 'invalid'))
);

create index if not exists campaign_audience_groups_organization_id_idx
  on campaign_audience_groups (organization_id);

create index if not exists campaign_audience_contacts_organization_id_idx
  on campaign_audience_contacts (organization_id);

create index if not exists campaign_audience_contacts_audience_group_id_idx
  on campaign_audience_contacts (audience_group_id);

create index if not exists campaign_audience_contacts_phone_normalized_idx
  on campaign_audience_contacts (phone_normalized);

create unique index if not exists campaign_audience_contacts_group_phone_unique_idx
  on campaign_audience_contacts (audience_group_id, phone_normalized);

do $$
begin
  if exists (
    select 1
    from pg_proc
    where proname = 'set_updated_at'
  ) and not exists (
    select 1
    from pg_trigger
    where tgname = 'campaign_audience_groups_set_updated_at'
  ) then
    create trigger campaign_audience_groups_set_updated_at
    before update on campaign_audience_groups
    for each row execute function set_updated_at();
  end if;
end $$;
