-- Remove historical contact identity values that were copied from the connected
-- WhatsApp account itself (for example the business display name or own number).
-- The API now also guards responses, but this migration repairs canonical data
-- and cached projections so Contacts and Inbox remain consistent.

update contact_identities ci
set profile_name = case
      when exists (
        select 1
        from whatsapp_accounts wa
        cross join lateral unnest(
          array[
            nullif(trim(wa.label), ''),
            nullif(trim(wa.display_name), ''),
            nullif(trim(wa.account_phone_e164), ''),
            nullif(trim(wa.account_phone_normalized), '')
          ]
        ) as candidate_value
        where wa.id = ci.whatsapp_account_id
          and nullif(trim(ci.profile_name), '') is not null
          and lower(trim(ci.profile_name)) = lower(trim(candidate_value))
      ) then null
      else profile_name
    end,
    profile_push_name = case
      when exists (
        select 1
        from whatsapp_accounts wa
        cross join lateral unnest(
          array[
            nullif(trim(wa.label), ''),
            nullif(trim(wa.display_name), ''),
            nullif(trim(wa.account_phone_e164), ''),
            nullif(trim(wa.account_phone_normalized), '')
          ]
        ) as candidate_value
        where wa.id = ci.whatsapp_account_id
          and nullif(trim(ci.profile_push_name), '') is not null
          and lower(trim(ci.profile_push_name)) = lower(trim(candidate_value))
      ) then null
      else profile_push_name
    end,
    updated_at = timezone('utc', now())
where exists (
  select 1
  from whatsapp_accounts wa
  cross join lateral unnest(
    array[
      nullif(trim(wa.label), ''),
      nullif(trim(wa.display_name), ''),
      nullif(trim(wa.account_phone_e164), ''),
      nullif(trim(wa.account_phone_normalized), '')
    ]
  ) as candidate_value
  where wa.id = ci.whatsapp_account_id
    and (
      (
        nullif(trim(ci.profile_name), '') is not null
        and lower(trim(ci.profile_name)) = lower(trim(candidate_value))
      )
      or (
        nullif(trim(ci.profile_push_name), '') is not null
        and lower(trim(ci.profile_push_name)) = lower(trim(candidate_value))
      )
    )
);

drop table if exists tmp_whatsapp_identity_poisoned_contacts;

create temporary table tmp_whatsapp_identity_poisoned_contacts (
  contact_id uuid primary key,
  clear_name boolean not null,
  clear_phone boolean not null
);

insert into tmp_whatsapp_identity_poisoned_contacts (
  contact_id,
  clear_name,
  clear_phone
)
with related_accounts as (
  select ci.organization_id, ci.contact_id, ci.whatsapp_account_id
  from contact_identities ci
  where ci.whatsapp_account_id is not null

  union

  select c.organization_id, c.contact_id, c.whatsapp_account_id
  from conversations c
  where c.whatsapp_account_id is not null

  union

  select m.organization_id, m.contact_id, m.whatsapp_account_id
  from messages m
  where m.whatsapp_account_id is not null
), account_values as (
  select distinct
    ra.organization_id,
    ra.contact_id,
    value_kind,
    candidate_value
  from related_accounts ra
  join whatsapp_accounts wa
    on wa.id = ra.whatsapp_account_id
   and wa.organization_id = ra.organization_id
  cross join lateral (
    values
      ('name'::text, nullif(trim(wa.label), '')),
      ('name'::text, nullif(trim(wa.display_name), '')),
      ('phone'::text, nullif(trim(wa.account_phone_e164), '')),
      ('phone'::text, nullif(trim(wa.account_phone_normalized), ''))
  ) as values_to_check(value_kind, candidate_value)
  where candidate_value is not null
)
select
  c.id,
  bool_or(
    av.value_kind = 'name'
    and nullif(trim(c.display_name), '') is not null
    and lower(trim(c.display_name)) = lower(trim(av.candidate_value))
  ) as clear_name,
  bool_or(
    av.value_kind = 'phone'
    and regexp_replace(
      coalesce(c.primary_phone_normalized, c.primary_phone_e164, ''),
      '\D',
      '',
      'g'
    ) <> ''
    and regexp_replace(
      coalesce(c.primary_phone_normalized, c.primary_phone_e164, ''),
      '\D',
      '',
      'g'
    ) = regexp_replace(av.candidate_value, '\D', '', 'g')
  ) as clear_phone
from contacts c
join account_values av
  on av.organization_id = c.organization_id
 and av.contact_id = c.id
group by c.id
having
  bool_or(
    av.value_kind = 'name'
    and nullif(trim(c.display_name), '') is not null
    and lower(trim(c.display_name)) = lower(trim(av.candidate_value))
  )
  or bool_or(
    av.value_kind = 'phone'
    and regexp_replace(
      coalesce(c.primary_phone_normalized, c.primary_phone_e164, ''),
      '\D',
      '',
      'g'
    ) <> ''
    and regexp_replace(
      coalesce(c.primary_phone_normalized, c.primary_phone_e164, ''),
      '\D',
      '',
      'g'
    ) = regexp_replace(av.candidate_value, '\D', '', 'g')
  );

update contacts c
set display_name = case when poisoned.clear_name then null else c.display_name end,
    primary_phone_e164 = case when poisoned.clear_phone then null else c.primary_phone_e164 end,
    primary_phone_normalized = case when poisoned.clear_phone then null else c.primary_phone_normalized end,
    is_anchor_locked = case when poisoned.clear_name then false else c.is_anchor_locked end,
    anchored_at = case when poisoned.clear_name then null else c.anchored_at end,
    anchored_by_source = case when poisoned.clear_name then null else c.anchored_by_source end,
    updated_at = timezone('utc', now())
from tmp_whatsapp_identity_poisoned_contacts poisoned
where c.id = poisoned.contact_id;

update inbox_thread_summary its
set contact_display_name = coalesce(
      nullif(trim(c.display_name), ''),
      nullif(trim(c.primary_phone_e164), ''),
      nullif(trim(c.primary_phone_normalized), '')
    ),
    contact_primary_phone = coalesce(
      nullif(trim(c.primary_phone_normalized), ''),
      nullif(trim(c.primary_phone_e164), '')
    ),
    updated_at = timezone('utc', now())
from contacts c
join tmp_whatsapp_identity_poisoned_contacts poisoned
  on poisoned.contact_id = c.id
where its.contact_id = c.id;

update contact_summary cs
set display_name = coalesce(
      nullif(trim(c.display_name), ''),
      nullif(trim(c.primary_phone_e164), ''),
      nullif(trim(c.primary_phone_normalized), '')
    ),
    primary_phone = coalesce(
      nullif(trim(c.primary_phone_normalized), ''),
      nullif(trim(c.primary_phone_e164), '')
    ),
    updated_at = timezone('utc', now())
from contacts c
join tmp_whatsapp_identity_poisoned_contacts poisoned
  on poisoned.contact_id = c.id
where cs.contact_id = c.id;

drop table if exists tmp_whatsapp_identity_poisoned_contacts;
