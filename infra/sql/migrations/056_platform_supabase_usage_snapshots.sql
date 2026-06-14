create table if not exists platform_supabase_usage_snapshots (
  id uuid primary key default gen_random_uuid(),

  collected_at timestamptz not null default now(),

  overall_status text not null default 'unknown',
  source_status text not null default 'partial',

  db_size_bytes bigint,
  db_disk_used_bytes bigint,
  db_disk_total_bytes bigint,
  db_disk_percent numeric,

  storage_used_bytes bigint,
  storage_quota_bytes bigint,
  storage_percent numeric,
  storage_object_count bigint,

  egress_bytes bigint,
  egress_quota_bytes bigint,
  egress_percent numeric,

  api_requests_count bigint,

  raw jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists idx_platform_supabase_usage_snapshots_collected_at
on platform_supabase_usage_snapshots (collected_at desc);
