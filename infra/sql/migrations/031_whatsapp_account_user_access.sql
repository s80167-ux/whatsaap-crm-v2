create table if not exists whatsapp_account_user_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  whatsapp_account_id uuid not null references whatsapp_accounts(id) on delete cascade,
  organization_user_id uuid not null references organization_users(id) on delete cascade,
  access_role text not null default 'agent' check (access_role in ('owner', 'manager', 'agent', 'viewer')),
  can_view boolean not null default true,
  can_reply boolean not null default true,
  can_create_sales boolean not null default true,
  can_edit_sales boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (whatsapp_account_id, organization_user_id)
);

create index if not exists idx_whatsapp_account_user_access_org_user
  on whatsapp_account_user_access (organization_id, organization_user_id);

create index if not exists idx_whatsapp_account_user_access_account_user
  on whatsapp_account_user_access (whatsapp_account_id, organization_user_id);

create index if not exists idx_whatsapp_account_user_access_org_account
  on whatsapp_account_user_access (organization_id, whatsapp_account_id);

drop trigger if exists whatsapp_account_user_access_set_updated_at on whatsapp_account_user_access;
create trigger whatsapp_account_user_access_set_updated_at
before update on whatsapp_account_user_access
for each row execute function set_updated_at();

insert into whatsapp_account_user_access (
  organization_id,
  whatsapp_account_id,
  organization_user_id,
  access_role,
  can_view,
  can_reply,
  can_create_sales,
  can_edit_sales
)
select
  wa.organization_id,
  wa.id,
  wa.created_by,
  'owner',
  true,
  true,
  true,
  true
from whatsapp_accounts wa
where wa.created_by is not null
on conflict (whatsapp_account_id, organization_user_id) do nothing;

insert into whatsapp_account_user_access (
  organization_id,
  whatsapp_account_id,
  organization_user_id,
  access_role,
  can_view,
  can_reply,
  can_create_sales,
  can_edit_sales
)
select distinct
  c.organization_id,
  c.whatsapp_account_id,
  c.assigned_user_id,
  'agent',
  true,
  true,
  true,
  false
from conversations c
where c.assigned_user_id is not null
  and c.whatsapp_account_id is not null
on conflict (whatsapp_account_id, organization_user_id) do nothing;

insert into whatsapp_account_user_access (
  organization_id,
  whatsapp_account_id,
  organization_user_id,
  access_role,
  can_view,
  can_reply,
  can_create_sales,
  can_edit_sales
)
select
  wa.organization_id,
  wa.id,
  fallback_owner.id,
  'owner',
  true,
  true,
  true,
  true
from whatsapp_accounts wa
join lateral (
  select ou.id
  from organization_users ou
  where ou.organization_id = wa.organization_id
    and ou.role = 'org_admin'
    and coalesce(ou.status, 'active') = 'active'
  order by ou.created_at asc, ou.id asc
  limit 1
) fallback_owner on true
where wa.created_by is null
  and not exists (
    select 1
    from conversations c
    where c.whatsapp_account_id = wa.id
      and c.assigned_user_id is not null
  )
on conflict (whatsapp_account_id, organization_user_id) do nothing;

do $$
declare
  orphan record;
begin
  -- Reports WhatsApp accounts that still have no owner fallback because the organization has no active org_admin.
  for orphan in
    select wa.id
    from whatsapp_accounts wa
    where wa.created_by is null
      and not exists (
        select 1
        from conversations c
        where c.whatsapp_account_id = wa.id
          and c.assigned_user_id is not null
      )
      and not exists (
        select 1
        from organization_users ou
        where ou.organization_id = wa.organization_id
          and ou.role = 'org_admin'
          and coalesce(ou.status, 'active') = 'active'
      )
  loop
    raise notice 'Orphan WhatsApp account skipped by whatsapp_account_user_access backfill: %', orphan.id;
  end loop;
end $$;
