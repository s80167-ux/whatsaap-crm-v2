create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  status text not null default 'active' check (status in ('active', 'trial', 'suspended', 'closed')),
  timezone text not null default 'Asia/Kuala_Lumpur',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organization_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  auth_user_id uuid,
  full_name text,
  email text,
  role text not null check (role in ('org_admin', 'manager', 'agent', 'user')),
  status text not null default 'active' check (status in ('invited', 'active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email)
);

create table if not exists platform_super_admins (
  auth_user_id uuid primary key,
  created_at timestamptz not null default now()
);

create table if not exists role_permissions (
  role text not null,
  permission_key text not null,
  primary key (role, permission_key)
);

create table if not exists organization_user_permissions (
  id uuid primary key default gen_random_uuid(),
  organization_user_id uuid not null references organization_users(id) on delete cascade,
  permission_key text not null,
  created_at timestamptz not null default now(),
  unique (organization_user_id, permission_key)
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  plan_code text not null,
  status text not null check (status in ('trial', 'active', 'past_due', 'cancelled')),
  seat_limit integer,
  whatsapp_account_limit integer,
  storage_limit_mb integer,
  started_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists usage_daily (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  usage_date date not null,
  inbound_messages integer not null default 0,
  outbound_messages integer not null default 0,
  active_contacts integer not null default 0,
  media_storage_mb numeric(12,2) not null default 0,
  connected_whatsapp_accounts integer not null default 0,
  created_at timestamptz not null default now(),
  unique (organization_id, usage_date)
);

create index if not exists idx_org_users_org on organization_users (organization_id);
create index if not exists idx_usage_daily_org_date on usage_daily (organization_id, usage_date desc);

drop trigger if exists organizations_set_updated_at on organizations;
create trigger organizations_set_updated_at
before update on organizations
for each row execute function set_updated_at();

drop trigger if exists organization_users_set_updated_at on organization_users;
create trigger organization_users_set_updated_at
before update on organization_users
for each row execute function set_updated_at();

drop trigger if exists subscriptions_set_updated_at on subscriptions;
create trigger subscriptions_set_updated_at
before update on subscriptions
for each row execute function set_updated_at();
