create table if not exists contact_reliability_ignored_flags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  flag text not null,
  ignored_by_user_id uuid references organization_users(id) on delete set null,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, contact_id, flag)
);

create index if not exists idx_contact_reliability_ignored_flags_contact
  on contact_reliability_ignored_flags (organization_id, contact_id);
