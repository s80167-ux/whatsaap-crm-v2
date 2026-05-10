  create table if not exists organization_limits (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    limit_key text not null,
    limit_value integer not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, limit_key)
  );

  create index if not exists idx_organization_limits_org_key
    on organization_limits (organization_id, limit_key);

  drop trigger if exists organization_limits_set_updated_at on organization_limits;
  create trigger organization_limits_set_updated_at
  before update on organization_limits
  for each row execute function set_updated_at();

  do $$
  begin
    if not exists (
      select 1
      from pg_constraint
      where conname = 'organization_limits_limit_value_check'
    ) then
      alter table organization_limits
        add constraint organization_limits_limit_value_check
        check (limit_value >= 0);
    end if;
  end $$;
