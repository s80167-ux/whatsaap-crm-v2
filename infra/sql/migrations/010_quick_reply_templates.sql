create table if not exists quick_reply_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  body text not null,
  category text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references organization_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, title)
);

create index if not exists idx_quick_reply_templates_org_active_sort
  on quick_reply_templates (organization_id, is_active, sort_order, title);

drop trigger if exists quick_reply_templates_set_updated_at on quick_reply_templates;
create trigger quick_reply_templates_set_updated_at
before update on quick_reply_templates
for each row execute function set_updated_at();
