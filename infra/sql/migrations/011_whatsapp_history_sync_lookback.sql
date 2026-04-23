alter table whatsapp_accounts
  add column if not exists history_sync_lookback_days integer not null default 7;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'whatsapp_accounts_history_sync_lookback_days_check'
  ) then
    alter table whatsapp_accounts
      add constraint whatsapp_accounts_history_sync_lookback_days_check
      check (history_sync_lookback_days between 0 and 365);
  end if;
end $$;
