alter table conversations
  alter column whatsapp_account_id drop not null,
  add column if not exists social_channel_account_id uuid references social_channel_accounts(id) on delete cascade;

alter table messages
  alter column whatsapp_account_id drop not null,
  add column if not exists social_channel_account_id uuid references social_channel_accounts(id) on delete cascade;

alter table contact_identities
  add column if not exists social_channel_account_id uuid references social_channel_accounts(id) on delete set null,
  add column if not exists external_profile_id text;

alter table inbox_thread_summary
  add column if not exists channel text not null default 'whatsapp',
  add column if not exists social_channel_account_id uuid references social_channel_accounts(id) on delete set null;

do $$
begin
  alter table conversations drop constraint if exists conversations_channel_check;
  alter table conversations
    add constraint conversations_channel_check
    check (channel in ('whatsapp', 'facebook', 'instagram'));

  alter table messages drop constraint if exists messages_channel_check;
  alter table messages
    add constraint messages_channel_check
    check (channel in ('whatsapp', 'facebook', 'instagram'));

  alter table contact_identities drop constraint if exists contact_identities_channel_check;
  alter table contact_identities
    add constraint contact_identities_channel_check
    check (channel in ('whatsapp', 'facebook', 'instagram'));
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_channel_account_check'
  ) then
    alter table conversations
      add constraint conversations_channel_account_check
      check (
        (channel = 'whatsapp' and whatsapp_account_id is not null)
        or (channel in ('facebook', 'instagram') and social_channel_account_id is not null)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_channel_account_check'
  ) then
    alter table messages
      add constraint messages_channel_account_check
      check (
        (channel = 'whatsapp' and whatsapp_account_id is not null)
        or (channel in ('facebook', 'instagram') and social_channel_account_id is not null)
      );
  end if;
end $$;

create unique index if not exists idx_conversations_social_thread_unique
  on conversations (organization_id, channel, social_channel_account_id, external_thread_key)
  where channel in ('facebook', 'instagram')
    and social_channel_account_id is not null
    and external_thread_key is not null;

create unique index if not exists idx_messages_social_external_unique
  on messages (organization_id, channel, social_channel_account_id, external_message_id)
  where channel in ('facebook', 'instagram')
    and social_channel_account_id is not null
    and external_message_id is not null;

create unique index if not exists idx_contact_identities_social_profile_unique
  on contact_identities (organization_id, channel, social_channel_account_id, external_profile_id)
  where channel in ('facebook', 'instagram')
    and social_channel_account_id is not null
    and external_profile_id is not null;

create index if not exists idx_conversations_social_account_last
  on conversations (social_channel_account_id, last_message_at desc)
  where social_channel_account_id is not null;

create index if not exists idx_messages_social_account_sent
  on messages (social_channel_account_id, sent_at desc)
  where social_channel_account_id is not null;
