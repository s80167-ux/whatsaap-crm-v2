with account_names as (
  select distinct
    wa.organization_id,
    wa.id as whatsapp_account_id,
    lower(trim(candidate_name)) as candidate_name
  from whatsapp_accounts wa
  cross join lateral unnest(
    array[
      nullif(trim(wa.label), ''),
      nullif(trim(wa.display_name), ''),
      nullif(trim(wa.account_phone_e164), ''),
      nullif(trim(wa.account_phone_normalized), '')
    ]
  ) as candidate_name
  where nullif(trim(candidate_name), '') is not null
),
poisoned_identities as (
  select ci.id
  from contact_identities ci
  join account_names an
    on an.organization_id = ci.organization_id
   and an.whatsapp_account_id = ci.whatsapp_account_id
   and lower(trim(ci.profile_name)) = an.candidate_name
  where nullif(trim(ci.profile_name), '') is not null
)
update contact_identities ci
set profile_name = null,
    updated_at = timezone('utc', now())
where ci.id in (select id from poisoned_identities);

with account_names as (
  select distinct
    wa.organization_id,
    wa.id as whatsapp_account_id,
    lower(trim(candidate_name)) as candidate_name
  from whatsapp_accounts wa
  cross join lateral unnest(
    array[
      nullif(trim(wa.label), ''),
      nullif(trim(wa.display_name), ''),
      nullif(trim(wa.account_phone_e164), ''),
      nullif(trim(wa.account_phone_normalized), '')
    ]
  ) as candidate_name
  where nullif(trim(candidate_name), '') is not null
),
contacts_to_reset as (
  select distinct c.id
  from contacts c
  join contact_identities ci
    on ci.contact_id = c.id
   and ci.organization_id = c.organization_id
  join account_names an
    on an.organization_id = ci.organization_id
   and an.whatsapp_account_id = ci.whatsapp_account_id
  where coalesce(c.is_anchor_locked, false) = false
    and c.anchored_by_source = 'whatsapp_identity'
    and lower(trim(c.display_name)) = an.candidate_name
)
update contacts c
set display_name = null,
    anchored_at = null,
    anchored_by_source = null,
    updated_at = timezone('utc', now())
where c.id in (select id from contacts_to_reset);
