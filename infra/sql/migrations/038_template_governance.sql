create table if not exists template_governance_settings (
  organization_id uuid primary key references organizations(id) on delete cascade,
  approval_required boolean not null default false,
  allow_agent_custom_templates boolean not null default false,
  auto_approve_org_admin_templates boolean not null default true,
  lock_approved_templates boolean not null default true,
  updated_by_user_id uuid references organization_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists template_governance_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  template_type text not null check (template_type in ('campaign_message', 'quick_reply', 'email_placeholder')),
  source_template_id uuid null,
  title text not null,
  category text,
  current_status text not null default 'draft' check (current_status in ('draft', 'pending_review', 'approved', 'rejected', 'archived')),
  active_version_id uuid null,
  created_by_user_id uuid references organization_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz,
  unique (organization_id, template_type, source_template_id)
);

create table if not exists template_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  template_type text not null check (template_type in ('campaign_message', 'quick_reply', 'email_placeholder')),
  template_id uuid not null references template_governance_templates(id) on delete cascade,
  version_number integer not null,
  snapshot jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'pending_review', 'approved', 'rejected', 'archived')),
  is_active boolean not null default false,
  change_summary text,
  created_by_user_id uuid references organization_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, template_type, template_id, version_number)
);

alter table template_governance_templates
  drop constraint if exists template_governance_templates_active_version_fk;

alter table template_governance_templates
  add constraint template_governance_templates_active_version_fk
  foreign key (active_version_id) references template_versions(id) on delete set null;

create table if not exists template_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  template_type text not null check (template_type in ('campaign_message', 'quick_reply', 'email_placeholder')),
  template_id uuid not null references template_governance_templates(id) on delete cascade,
  version_id uuid not null references template_versions(id) on delete cascade,
  requested_by_user_id uuid references organization_users(id) on delete set null,
  reviewed_by_user_id uuid references organization_users(id) on delete set null,
  status text not null check (status in ('pending_review', 'approved', 'rejected')),
  review_note text,
  requested_at timestamptz not null default timezone('utc', now()),
  reviewed_at timestamptz
);

create index if not exists idx_template_versions_template_created
  on template_versions (organization_id, template_type, template_id, version_number desc);

create index if not exists idx_template_approvals_version
  on template_approvals (organization_id, version_id, requested_at desc);

create index if not exists idx_template_governance_templates_org_status
  on template_governance_templates (organization_id, template_type, current_status, updated_at desc);

drop trigger if exists template_governance_settings_set_updated_at on template_governance_settings;
create trigger template_governance_settings_set_updated_at
before update on template_governance_settings
for each row execute function set_updated_at();

drop trigger if exists template_governance_templates_set_updated_at on template_governance_templates;
create trigger template_governance_templates_set_updated_at
before update on template_governance_templates
for each row execute function set_updated_at();
