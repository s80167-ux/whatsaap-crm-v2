create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists organization_modules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  module_key text not null,
  is_enabled boolean not null default false,
  enabled_by uuid null,
  enabled_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, module_key),
  constraint organization_modules_module_key_supported check (module_key in ('campaigns'))
);

create index if not exists organization_modules_organization_id_idx
  on organization_modules (organization_id);

create index if not exists organization_modules_module_key_idx
  on organization_modules (module_key);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'organization_modules_set_updated_at'
  ) then
    create trigger organization_modules_set_updated_at
    before update on organization_modules
    for each row execute function set_updated_at();
  end if;
end $$;
