create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,
  actor_auth_user_id uuid,
  actor_organization_user_id uuid references organization_users(id) on delete set null,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  request_ip text,
  request_user_agent text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created_at
  on audit_logs (created_at desc);

create index if not exists idx_audit_logs_org_created_at
  on audit_logs (organization_id, created_at desc);

create index if not exists idx_audit_logs_action_created_at
  on audit_logs (action, created_at desc);
