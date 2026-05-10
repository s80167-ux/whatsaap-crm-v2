alter table contacts
  add column if not exists deleted_at timestamptz;

alter table contact_identities
  add column if not exists deleted_at timestamptz;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'contact_identities_organization_id_channel_wa_jid_key'
  ) then
    alter table contact_identities
      drop constraint contact_identities_organization_id_channel_wa_jid_key;
  end if;
end $$;

drop index if exists contact_identities_org_account_jid_unique;
drop index if exists contact_identities_org_account_phone_unique;

create unique index if not exists contact_identities_org_account_wa_jid_active_unique
  on contact_identities (organization_id, whatsapp_account_id, wa_jid)
  where deleted_at is null;

create index if not exists idx_contact_identities_org_account_phone
  on contact_identities (organization_id, whatsapp_account_id, phone_normalized)
  where phone_normalized is not null and deleted_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'i'
      and c.relname = 'conversations_org_account_contact_unique'
      and n.nspname = current_schema()
  ) then
    if not exists (
      select 1
      from conversations
      group by organization_id, whatsapp_account_id, contact_id
      having count(*) > 1
    ) then
      execute '
        create unique index conversations_org_account_contact_unique
          on conversations (organization_id, whatsapp_account_id, contact_id)
      ';
    else
      raise notice 'Skipping conversations_org_account_contact_unique because duplicate conversation rows already exist.';
    end if;
  end if;
end $$;
