create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  recipient_user_id uuid,
  recipient_org_user_id uuid references organization_users(id) on delete cascade,
  type text not null,
  title text not null,
  message text,
  target_path text,
  target_entity_type text,
  target_entity_id uuid,
  unique_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists notification_reads (
  notification_id uuid not null references notifications(id) on delete cascade,
  auth_user_id uuid not null,
  read_at timestamptz not null default now(),
  primary key (notification_id, auth_user_id)
);

create unique index if not exists uniq_notifications_unique_key
  on notifications (unique_key)
  where unique_key is not null;

create index if not exists idx_notifications_org_created
  on notifications (organization_id, created_at desc);

create index if not exists idx_notifications_recipient_org_user_created
  on notifications (recipient_org_user_id, created_at desc);

create index if not exists idx_notifications_recipient_user_created
  on notifications (recipient_user_id, created_at desc);

create index if not exists idx_notification_reads_auth_user
  on notification_reads (auth_user_id, read_at desc);

drop trigger if exists notifications_set_updated_at on notifications;
create trigger notifications_set_updated_at
before update on notifications
for each row execute function set_updated_at();
