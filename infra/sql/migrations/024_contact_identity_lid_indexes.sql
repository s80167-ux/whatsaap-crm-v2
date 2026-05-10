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

do $$
declare
  duplicate_count integer;
begin
  select count(*)
  into duplicate_count
  from (
    select organization_id, whatsapp_account_id, wa_jid
    from contact_identities
    where deleted_at is null
      and wa_jid is not null
    group by organization_id, whatsapp_account_id, wa_jid
    having count(*) > 1
  ) duplicates;

  if duplicate_count > 0 then
    raise notice 'Soft-deleting duplicate active contact identity rows before creating contact_identities_org_account_wa_jid_active_unique: % duplicate keys.', duplicate_count;
  end if;
end $$;

with ranked_duplicate_identities as (
  select
    id,
    row_number() over (
      partition by organization_id, whatsapp_account_id, wa_jid
      order by
        (
          case when phone_normalized is not null then 1 else 0 end +
          case when phone_e164 is not null then 1 else 0 end +
          case when nullif(trim(coalesce(profile_name, '')), '') is not null then 1 else 0 end +
          case when nullif(trim(coalesce(profile_push_name, '')), '') is not null then 1 else 0 end +
          case when nullif(trim(coalesce(profile_avatar_url, '')), '') is not null then 1 else 0 end
        ) desc,
        last_seen_at desc nulls last,
        updated_at desc nulls last,
        created_at desc nulls last,
        id
    ) as duplicate_rank
  from contact_identities
  where deleted_at is null
    and wa_jid is not null
)
update contact_identities ci
set
  deleted_at = timezone('utc', now()),
  is_active = false
from ranked_duplicate_identities rdi
where ci.id = rdi.id
  and rdi.duplicate_rank > 1
  and ci.deleted_at is null;

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
