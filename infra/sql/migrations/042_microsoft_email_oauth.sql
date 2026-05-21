alter table email_senders
  add column if not exists oauth_provider_user_id text null,
  add column if not exists oauth_tenant_id text null,
  add column if not exists oauth_token_expires_at timestamptz null,
  add column if not exists oauth_scopes text[] not null default '{}',
  add column if not exists oauth_connected_at timestamptz null;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'email_senders'
      and constraint_name = 'email_senders_status_check'
  ) then
    alter table email_senders drop constraint email_senders_status_check;
  end if;
end $$;

alter table email_senders
  add constraint email_senders_status_check
  check (status in ('draft', 'verified', 'failed', 'disabled', 'expired', 'reconnect_required'));

create unique index if not exists email_senders_microsoft_org_email_lower_unique
  on email_senders (organization_id, sender_type, lower(from_email))
  where sender_type = 'microsoft365';

create table if not exists email_oauth_states (
  state text primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references organization_users(id) on delete cascade,
  provider text not null,
  redirect_to text null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_email_oauth_states_expiry
  on email_oauth_states (expires_at);

create index if not exists idx_email_senders_oauth_provider_user
  on email_senders (organization_id, oauth_provider, oauth_provider_user_id)
  where oauth_provider_user_id is not null;
