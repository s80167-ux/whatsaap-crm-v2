update email_senders
set sender_type = 'custom_smtp'
where sender_type = 'smtp';

update email_senders
set sender_type = 'gmail_app_password',
    smtp_host = 'smtp.gmail.com',
    smtp_port = 587,
    smtp_secure = false
where sender_type = 'gmail';

update email_senders
set status = 'disabled',
    last_test_status = 'disabled',
    last_test_error = 'Microsoft email provider is no longer supported in this MVP. Please use Custom SMTP or Gmail App Password.'
where sender_type = 'microsoft365';

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'email_senders'
      and constraint_name = 'email_senders_sender_type_check'
  ) then
    alter table email_senders drop constraint email_senders_sender_type_check;
  end if;
end $$;

alter table email_senders
  add constraint email_senders_sender_type_check
  check (sender_type in ('custom_smtp', 'gmail_app_password', 'microsoft365'));

alter table email_campaign_recipients
  add column if not exists company text null,
  add column if not exists phone text null;

drop index if exists email_senders_microsoft_org_email_lower_unique;

delete from email_oauth_states
where provider = 'microsoft'
  and expires_at < timezone('utc', now());
