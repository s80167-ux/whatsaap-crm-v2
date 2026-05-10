create table if not exists google_signup_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  email text not null,
  full_name text,
  avatar_url text,
  provider text not null default 'google',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_auth_user_id uuid,
  approved_organization_id uuid references organizations(id) on delete set null,
  approved_organization_user_id uuid references organization_users(id) on delete set null,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uniq_google_signup_requests_email
  on google_signup_requests (lower(email))
  where provider = 'google';

create unique index if not exists uniq_google_signup_requests_auth_user
  on google_signup_requests (auth_user_id);

create index if not exists idx_google_signup_requests_status_requested
  on google_signup_requests (status, requested_at desc);

drop trigger if exists google_signup_requests_set_updated_at on google_signup_requests;
create trigger google_signup_requests_set_updated_at
before update on google_signup_requests
for each row execute function set_updated_at();
