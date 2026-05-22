alter table email_senders
  add column if not exists deleted_at timestamptz null,
  add column if not exists is_active boolean not null default true;

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
  check (status in ('draft', 'verified', 'failed', 'disabled', 'expired', 'reconnect_required', 'deleted'));

create index if not exists idx_email_senders_org_active_created
  on email_senders (organization_id, created_at desc)
  where deleted_at is null and is_active = true;
