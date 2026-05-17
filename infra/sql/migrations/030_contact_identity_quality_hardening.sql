alter table contacts
  add column if not exists identity_status text not null default 'resolved';

alter table contact_identities
  add column if not exists identity_quality text not null default 'normal',
  add column if not exists identity_score integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contacts_identity_status_check'
  ) then
    alter table contacts
      add constraint contacts_identity_status_check
      check (identity_status in ('resolved', 'provisional', 'needs_phone', 'needs_merge_review'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contact_identities_identity_quality_check'
  ) then
    alter table contact_identities
      add constraint contact_identities_identity_quality_check
      check (identity_quality in ('strong', 'normal', 'weak', 'lid_only', 'phone_verified'));
  end if;
end $$;

update contact_identities
set identity_score =
      (case when phone_normalized is not null then 50 else 0 end) +
      (case
        when nullif(trim(profile_name), '') is not null
          and lower(trim(profile_name)) not in ('unknown', 'customer', 'no name', 'whatsapp', 'business', 'user', 'device', 'iphone', 'android', 'test', 'admin', 'contact')
        then 20 else -30
      end) +
      (case when nullif(trim(profile_avatar_url), '') is not null then 10 else 0 end) +
      (case when wa_jid like '%@s.whatsapp.net' or wa_jid like '%@c.us' then 20 else 0 end) -
      (case when wa_jid like '%@lid' and phone_normalized is null then 30 else 0 end) -
      (case when nullif(trim(profile_avatar_url), '') is not null and phone_normalized is null then 20 else 0 end)
where identity_score = 0;

update contact_identities
set identity_quality = case
    when wa_jid like '%@lid' and phone_normalized is null then 'lid_only'
    when phone_normalized is not null and (wa_jid like '%@s.whatsapp.net' or wa_jid like '%@c.us') then 'phone_verified'
    when identity_score >= 70 then 'strong'
    when identity_score >= 40 then 'normal'
    else 'weak'
  end
where identity_quality = 'normal';

update contacts c
set identity_status = case
    when nullif(trim(c.primary_avatar_url), '') is not null
      and c.primary_phone_normalized is null
      and c.primary_phone_e164 is null then 'needs_phone'
    when exists (
      select 1
      from contact_identities ci
      where ci.contact_id = c.id
        and ci.deleted_at is null
        and ci.identity_quality = 'lid_only'
    )
      and c.primary_phone_normalized is null
      and c.primary_phone_e164 is null then 'needs_phone'
    when exists (
      select 1
      from contact_identities ci
      where ci.contact_id = c.id
        and ci.deleted_at is null
        and ci.identity_quality = 'weak'
    ) then 'provisional'
    else identity_status
  end
where identity_status = 'resolved';

do $$
declare
  duplicate_phone_keys integer;
begin
  select count(*)
  into duplicate_phone_keys
  from (
    select organization_id, primary_phone_normalized
    from contacts
    where primary_phone_normalized is not null
      and deleted_at is null
    group by organization_id, primary_phone_normalized
    having count(*) > 1
  ) duplicates;

  if duplicate_phone_keys > 0 then
    raise notice 'Skipping contacts_org_primary_phone_active_unique because % active organization/phone duplicate keys need admin merge review first.', duplicate_phone_keys;
  elsif not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'i'
      and c.relname = 'contacts_org_primary_phone_active_unique'
      and n.nspname = current_schema()
  ) then
    execute '
      create unique index contacts_org_primary_phone_active_unique
      on contacts (organization_id, primary_phone_normalized)
      where primary_phone_normalized is not null and deleted_at is null
    ';
  end if;
end $$;

do $$
declare
  duplicate_conversation_keys integer;
begin
  select count(*)
  into duplicate_conversation_keys
  from (
    select organization_id, whatsapp_account_id, contact_id
    from conversations
    where channel = 'whatsapp'
    group by organization_id, whatsapp_account_id, contact_id
    having count(*) > 1
  ) duplicates;

  if duplicate_conversation_keys > 0 then
    raise notice 'Skipping conversations_org_account_contact_unique because % duplicate conversation keys need admin repair first.', duplicate_conversation_keys;
  elsif not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'i'
      and c.relname = 'conversations_org_account_contact_unique'
      and n.nspname = current_schema()
  ) then
    execute '
      create unique index conversations_org_account_contact_unique
      on conversations (organization_id, whatsapp_account_id, contact_id)
      where channel = ''whatsapp''
    ';
  end if;
end $$;

create or replace function repair_duplicate_conversations_for_contact(
  p_organization_id uuid,
  p_whatsapp_account_id uuid,
  p_contact_id uuid,
  p_dry_run boolean default true
) returns jsonb
language plpgsql
as $$
declare
  master_id uuid;
  duplicate_ids uuid[];
  moved_messages integer := 0;
begin
  select id
  into master_id
  from conversations
  where organization_id = p_organization_id
    and whatsapp_account_id = p_whatsapp_account_id
    and contact_id = p_contact_id
    and channel = 'whatsapp'
  order by last_message_at desc nulls last, updated_at desc nulls last, created_at desc nulls last, id
  limit 1;

  select coalesce(array_agg(id), '{}'::uuid[])
  into duplicate_ids
  from conversations
  where organization_id = p_organization_id
    and whatsapp_account_id = p_whatsapp_account_id
    and contact_id = p_contact_id
    and channel = 'whatsapp'
    and id <> master_id;

  if master_id is null or coalesce(array_length(duplicate_ids, 1), 0) = 0 or p_dry_run then
    return jsonb_build_object(
      'dry_run', p_dry_run,
      'master_conversation_id', master_id,
      'duplicate_conversation_ids', duplicate_ids,
      'moved_messages', moved_messages
    );
  end if;

  update messages
  set conversation_id = master_id,
      updated_at = timezone('utc', now())
  where organization_id = p_organization_id
    and conversation_id = any(duplicate_ids);
  get diagnostics moved_messages = row_count;

  update conversations master
  set first_message_at = least(
        coalesce(master.first_message_at, timezone('utc', now())),
        coalesce(source_stats.first_message_at, master.first_message_at, timezone('utc', now()))
      ),
      last_message_at = greatest(
        coalesce(master.last_message_at, '-infinity'::timestamptz),
        coalesce(source_stats.last_message_at, '-infinity'::timestamptz)
      ),
      last_incoming_at = greatest(
        coalesce(master.last_incoming_at, '-infinity'::timestamptz),
        coalesce(source_stats.last_incoming_at, '-infinity'::timestamptz)
      ),
      last_outgoing_at = greatest(
        coalesce(master.last_outgoing_at, '-infinity'::timestamptz),
        coalesce(source_stats.last_outgoing_at, '-infinity'::timestamptz)
      ),
      unread_count = coalesce(master.unread_count, 0) + coalesce(source_stats.unread_count, 0),
      updated_at = timezone('utc', now())
  from (
    select
      min(first_message_at) as first_message_at,
      max(last_message_at) as last_message_at,
      max(last_incoming_at) as last_incoming_at,
      max(last_outgoing_at) as last_outgoing_at,
      sum(coalesce(unread_count, 0))::integer as unread_count
    from conversations
    where id = any(duplicate_ids)
  ) source_stats
  where master.id = master_id;

  delete from conversations
  where id = any(duplicate_ids)
    and organization_id = p_organization_id;

  return jsonb_build_object(
    'dry_run', false,
    'master_conversation_id', master_id,
    'duplicate_conversation_ids', duplicate_ids,
    'moved_messages', moved_messages
  );
end;
$$;
