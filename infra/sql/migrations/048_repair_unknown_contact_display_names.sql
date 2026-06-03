-- Repair contacts that were downgraded to weak/unknown display names.
-- Safe to run more than once. It only updates contacts whose current display_name is weak
-- and only when a better historical identity name is available.

begin;

with weak_contacts as (
  select
    c.id,
    c.organization_id,
    c.display_name,
    c.primary_phone_normalized,
    c.primary_phone_e164
  from contacts c
  where c.deleted_at is null
    and coalesce(c.status, 'active') != 'merged'
    and (
      nullif(trim(c.display_name), '') is null
      or lower(trim(c.display_name)) in (
        'unknown',
        'unknown contact',
        'customer',
        'no name',
        'noname',
        'whatsapp',
        'business',
        'user',
        'device',
        'iphone',
        'android',
        'test',
        'admin',
        'contact'
      )
      or regexp_replace(c.display_name, '\\D', '', 'g') = regexp_replace(coalesce(c.primary_phone_normalized, c.primary_phone_e164, ''), '\\D', '', 'g')
      or c.display_name ~* '(@s\\.whatsapp\\.net|@c\\.us|@g\\.us|@lid)$'
    )
), best_identity as (
  select distinct on (wc.id)
    wc.id as contact_id,
    nullif(trim(ci.profile_name), '') as repaired_display_name
  from weak_contacts wc
  join contact_identities ci on ci.contact_id = wc.id
  where ci.deleted_at is null
    and coalesce(ci.is_active, true)
    and coalesce(ci.identity_quality, 'normal') not in ('weak', 'lid_only')
    and nullif(trim(ci.profile_name), '') is not null
    and lower(trim(ci.profile_name)) not in (
      'unknown',
      'unknown contact',
      'customer',
      'no name',
      'noname',
      'whatsapp',
      'business',
      'user',
      'device',
      'iphone',
      'android',
      'test',
      'admin',
      'contact'
    )
    and regexp_replace(ci.profile_name, '\\D', '', 'g') != regexp_replace(coalesce(wc.primary_phone_normalized, wc.primary_phone_e164, ''), '\\D', '', 'g')
    and ci.profile_name !~* '(@s\\.whatsapp\\.net|@c\\.us|@g\\.us|@lid)$'
  order by
    wc.id,
    case coalesce(ci.identity_quality, 'normal')
      when 'phone_verified' then 4
      when 'strong' then 3
      when 'normal' then 2
      else 1
    end desc,
    ci.last_seen_at desc nulls last,
    ci.updated_at desc,
    ci.created_at desc,
    ci.id desc
), repaired as (
  update contacts c
  set display_name = bi.repaired_display_name,
      identity_status = case
        when coalesce(c.identity_status, 'provisional') = 'provisional' then 'resolved'
        else c.identity_status
      end,
      anchored_at = coalesce(c.anchored_at, timezone('utc', now())),
      anchored_by_source = coalesce(c.anchored_by_source, 'repair_identity'),
      updated_at = timezone('utc', now())
  from best_identity bi
  where c.id = bi.contact_id
  returning c.id, c.organization_id, c.display_name
)
update contact_summary cs
set display_name = repaired.display_name,
    updated_at = timezone('utc', now())
from repaired
where cs.contact_id = repaired.id;

with repaired_contacts as (
  select c.id, c.display_name
  from contacts c
  where c.deleted_at is null
    and nullif(trim(c.display_name), '') is not null
    and lower(trim(c.display_name)) not in (
      'unknown',
      'unknown contact',
      'customer',
      'no name',
      'noname',
      'whatsapp',
      'business',
      'user',
      'device',
      'iphone',
      'android',
      'test',
      'admin',
      'contact'
    )
)
update inbox_thread_summary its
set contact_display_name = rc.display_name,
    updated_at = timezone('utc', now())
from repaired_contacts rc
where its.contact_id = rc.id
  and (
    nullif(trim(its.contact_display_name), '') is null
    or lower(trim(its.contact_display_name)) in (
      'unknown',
      'unknown contact',
      'customer',
      'no name',
      'noname',
      'whatsapp',
      'business',
      'user',
      'device',
      'iphone',
      'android',
      'test',
      'admin',
      'contact'
    )
    or its.contact_display_name ~* '(@s\\.whatsapp\\.net|@c\\.us|@g\\.us|@lid)$'
  );

commit;
