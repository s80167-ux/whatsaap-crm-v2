alter table quick_reply_templates
  add column if not exists usage_count integer not null default 0,
  add column if not exists last_used_at timestamptz;

create index if not exists idx_quick_reply_templates_org_usage
  on quick_reply_templates (organization_id, usage_count desc, last_used_at desc);
