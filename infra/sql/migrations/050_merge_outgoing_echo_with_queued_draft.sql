-- Fix duplicate outgoing WhatsApp bubbles when an inbox send is echoed back by Baileys
-- with a different chat identity, for example @s.whatsapp.net vs @lid.
--
-- The API creates a queued draft first. Later, WhatsApp may emit the same fromMe
-- message as a normal message.upsert event. If the echo uses a different
-- external_chat_id, the application-level queued-draft lookup can miss it and
-- insert a second outgoing bubble. This migration links that echo back to the
-- queued draft at the database boundary and retires already-created duplicates.

create or replace function public.rezeki_link_outgoing_echo_to_queued_draft()
returns trigger
language plpgsql
as $$
declare
  queued_message_id uuid;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  if new.direction <> 'outgoing'
    or coalesce(new.channel, 'whatsapp') <> 'whatsapp'
    or new.whatsapp_account_id is null
    or new.external_message_id is null
    or new.external_message_id like 'queued:%'
    or new.organization_id is null
    or new.conversation_id is null
    or new.contact_id is null then
    return new;
  end if;

  -- If the real WhatsApp message id already exists, keep normal ON CONFLICT
  -- behaviour. This avoids trying to rewrite another draft onto an occupied id.
  if exists (
    select 1
    from public.messages existing
    where existing.whatsapp_account_id = new.whatsapp_account_id
      and existing.external_message_id = new.external_message_id
  ) then
    return new;
  end if;

  select q.id
  into queued_message_id
  from public.messages q
  where q.organization_id = new.organization_id
    and q.conversation_id = new.conversation_id
    and q.contact_id = new.contact_id
    and q.whatsapp_account_id = new.whatsapp_account_id
    and q.direction = 'outgoing'
    and coalesce(q.channel, 'whatsapp') = 'whatsapp'
    and q.is_deleted = false
    and q.external_message_id like 'queued:%'
    and coalesce(q.sent_at, q.created_at) between
      coalesce(new.sent_at, timezone('utc', now())) - interval '15 minutes'
      and coalesce(new.sent_at, timezone('utc', now())) + interval '15 minutes'
    and (
      nullif(new.content_text, '') is null
      or q.content_text = new.content_text
      or q.content_text is null
    )
  order by
    case when q.external_chat_id = new.external_chat_id then 0 else 1 end,
    abs(extract(epoch from (coalesce(q.sent_at, q.created_at) - coalesce(new.sent_at, timezone('utc', now()))))) asc,
    coalesce(q.sent_at, q.created_at) desc
  limit 1;

  if queued_message_id is null then
    return new;
  end if;

  update public.messages q
  set external_message_id = new.external_message_id,
      external_chat_id = coalesce(new.external_chat_id, q.external_chat_id),
      content_json = case
        when new.content_json is null then q.content_json
        when q.content_json is null then jsonb_build_object('rawPayload', new.content_json)
        else q.content_json || jsonb_build_object('rawPayload', new.content_json)
      end,
      sent_at = coalesce(new.sent_at, q.sent_at),
      ack_status = case
        when q.ack_status in ('played', 'read', 'device_delivered') then q.ack_status
        when coalesce(new.ack_status, 'server_ack') in ('played', 'read', 'device_delivered', 'server_ack') then coalesce(new.ack_status, 'server_ack')
        else 'server_ack'
      end,
      delivered_at = coalesce(q.delivered_at, new.delivered_at),
      read_at = coalesce(q.read_at, new.read_at),
      failed_at = case
        when coalesce(new.ack_status, 'server_ack') = 'failed' then coalesce(q.failed_at, new.failed_at)
        else null
      end,
      updated_at = timezone('utc', now())
  where q.id = queued_message_id;

  insert into public.message_status_events (message_id, status, payload)
  values (
    queued_message_id,
    'server_ack',
    jsonb_build_object(
      'linked_from_insert_trigger', true,
      'external_message_id', new.external_message_id,
      'external_chat_id', new.external_chat_id
    )
  );

  -- Cancel the duplicate insert. The existing queued row now carries the real
  -- external_message_id, so insertIfAbsent can still select it in its fallback.
  return null;
end;
$$;

drop trigger if exists trg_rezeki_link_outgoing_echo_to_queued_draft on public.messages;

create trigger trg_rezeki_link_outgoing_echo_to_queued_draft
before insert on public.messages
for each row
execute function public.rezeki_link_outgoing_echo_to_queued_draft();

-- One-time repair for duplicates already created before this migration.
with candidate_pairs as (
  select distinct on (q.id)
    q.id as queued_id,
    a.id as actual_id,
    a.external_message_id as actual_external_message_id,
    a.external_chat_id as actual_external_chat_id,
    a.content_json as actual_content_json,
    a.sent_at as actual_sent_at,
    a.ack_status as actual_ack_status,
    a.delivered_at as actual_delivered_at,
    a.read_at as actual_read_at
  from public.messages q
  join public.messages a
    on a.organization_id = q.organization_id
   and a.conversation_id = q.conversation_id
   and a.contact_id = q.contact_id
   and a.whatsapp_account_id = q.whatsapp_account_id
   and a.id <> q.id
  where q.direction = 'outgoing'
    and a.direction = 'outgoing'
    and coalesce(q.channel, 'whatsapp') = 'whatsapp'
    and coalesce(a.channel, 'whatsapp') = 'whatsapp'
    and q.is_deleted = false
    and a.is_deleted = false
    and q.external_message_id like 'queued:%'
    and a.external_message_id is not null
    and a.external_message_id not like 'queued:%'
    and coalesce(q.sent_at, q.created_at) between
      coalesce(a.sent_at, a.created_at) - interval '15 minutes'
      and coalesce(a.sent_at, a.created_at) + interval '15 minutes'
    and (
      nullif(a.content_text, '') is null
      or q.content_text = a.content_text
      or q.content_text is null
    )
  order by
    q.id,
    case when q.external_chat_id = a.external_chat_id then 0 else 1 end,
    abs(extract(epoch from (coalesce(q.sent_at, q.created_at) - coalesce(a.sent_at, a.created_at)))) asc,
    coalesce(a.sent_at, a.created_at) desc
), retired_duplicates as (
  update public.messages a
  set is_deleted = true,
      external_message_id = concat('duplicate:', a.id::text),
      updated_at = timezone('utc', now())
  from candidate_pairs p
  where a.id = p.actual_id
  returning
    p.queued_id,
    p.actual_id,
    p.actual_external_message_id,
    p.actual_external_chat_id,
    p.actual_content_json,
    p.actual_sent_at,
    p.actual_ack_status,
    p.actual_delivered_at,
    p.actual_read_at
), merged_drafts as (
  update public.messages q
  set external_message_id = r.actual_external_message_id,
      external_chat_id = coalesce(r.actual_external_chat_id, q.external_chat_id),
      content_json = case
        when r.actual_content_json is null then q.content_json
        when q.content_json is null then jsonb_build_object('rawPayload', r.actual_content_json)
        else q.content_json || jsonb_build_object('rawPayload', r.actual_content_json)
      end,
      sent_at = coalesce(r.actual_sent_at, q.sent_at),
      ack_status = case
        when q.ack_status in ('played', 'read', 'device_delivered') then q.ack_status
        when coalesce(r.actual_ack_status, 'server_ack') in ('played', 'read', 'device_delivered', 'server_ack') then coalesce(r.actual_ack_status, 'server_ack')
        else 'server_ack'
      end,
      delivered_at = coalesce(q.delivered_at, r.actual_delivered_at),
      read_at = coalesce(q.read_at, r.actual_read_at),
      failed_at = null,
      updated_at = timezone('utc', now())
  from retired_duplicates r
  where q.id = r.queued_id
  returning q.id as message_id, r.actual_id, r.actual_external_message_id
)
insert into public.message_status_events (message_id, status, payload)
select
  message_id,
  'server_ack',
  jsonb_build_object(
    'merged_existing_duplicate', true,
    'retired_duplicate_message_id', actual_id,
    'external_message_id', actual_external_message_id
  )
from merged_drafts;
