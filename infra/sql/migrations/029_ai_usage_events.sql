create table if not exists ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  organization_user_id uuid references organization_users(id) on delete set null,
  auth_user_id uuid,
  feature_key text not null default 'ai_message_assist',
  source text not null,
  action text not null,
  provider text not null check (provider in ('deepseek', 'fallback')),
  model text,
  prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
  completion_tokens integer not null default 0 check (completion_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  credit_units integer not null default 0 check (credit_units >= 0),
  success boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_usage_events_org_created
  on ai_usage_events (organization_id, created_at desc);

create index if not exists idx_ai_usage_events_org_feature_created
  on ai_usage_events (organization_id, feature_key, created_at desc);
