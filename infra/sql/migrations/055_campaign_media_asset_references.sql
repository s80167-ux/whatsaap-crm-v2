-- ============================================================
-- Migration 055: Campaign media asset references and message guards
-- ============================================================

alter table campaigns
  add column if not exists media_id uuid references media_assets(id) on delete set null;

comment on column campaigns.media_id is 'Stored media asset reference for campaign attachments';

create table if not exists message_outbound_media_backups (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  outbound_media jsonb not null,
  backed_up_at timestamptz not null default timezone('utc', now())
);

create table if not exists outbox_attachment_backups (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references message_dispatch_outbox(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  attachment jsonb not null,
  backed_up_at timestamptz not null default timezone('utc', now())
);

create or replace function sanitize_message_content_json(input jsonb)
returns jsonb
language sql
immutable
as $$
  select
    case
      when input is null then null
      when jsonb_typeof(input) <> 'object' then input
      else
        (input - 'rawPayload') ||
        case
          when jsonb_typeof(input->'outboundMedia') = 'object' then
            jsonb_build_object('outboundMedia', (input->'outboundMedia') - 'dataBase64')
          else '{}'::jsonb
        end
    end
$$;

create or replace function compact_oversized_outbound_media()
returns trigger
language plpgsql
as $$
declare
  outbound_media jsonb;
  outbound_media_size integer;
begin
  if new.content_json is null or jsonb_typeof(new.content_json) <> 'object' then
    return new;
  end if;

  outbound_media := new.content_json->'outboundMedia';
  if outbound_media is null or jsonb_typeof(outbound_media) <> 'object' then
    return new;
  end if;

  outbound_media_size := octet_length(convert_to(outbound_media::text, 'utf8'));
  if outbound_media_size <= 51200 then
    return new;
  end if;

  new.content_json :=
    (new.content_json - 'outboundMedia') ||
    jsonb_build_object(
      'outboundMedia',
      (outbound_media - 'dataBase64') ||
      jsonb_build_object(
        'outboundMediaCompacted', true,
        'outboundMediaOriginalSize', outbound_media_size,
        'compactedAt', timezone('utc', now())
      )
    );

  return new;
end;
$$;

drop trigger if exists messages_compact_oversized_outbound_media on messages;
create trigger messages_compact_oversized_outbound_media
before insert or update on messages
for each row
execute function compact_oversized_outbound_media();

insert into message_outbound_media_backups (message_id, organization_id, outbound_media)
select
  m.id,
  m.organization_id,
  m.content_json->'outboundMedia'
from messages m
where m.content_json is not null
  and jsonb_typeof(m.content_json) = 'object'
  and jsonb_typeof(m.content_json->'outboundMedia') = 'object'
  and octet_length(convert_to((m.content_json->'outboundMedia')::text, 'utf8')) > 51200
  and not exists (
    select 1
    from message_outbound_media_backups b
    where b.message_id = m.id
  );

update messages m
set content_json =
  (m.content_json - 'outboundMedia') ||
  jsonb_build_object(
    'outboundMedia',
    ((m.content_json->'outboundMedia') - 'dataBase64') ||
    jsonb_build_object(
      'outboundMediaCompacted', true,
      'outboundMediaOriginalSize', octet_length(convert_to((m.content_json->'outboundMedia')::text, 'utf8')),
      'compactedAt', timezone('utc', now())
    )
  ),
  updated_at = timezone('utc', now())
where m.content_json is not null
  and jsonb_typeof(m.content_json) = 'object'
  and jsonb_typeof(m.content_json->'outboundMedia') = 'object'
  and octet_length(convert_to((m.content_json->'outboundMedia')::text, 'utf8')) > 51200;

insert into outbox_attachment_backups (outbox_id, organization_id, attachment)
select
  o.id,
  o.organization_id,
  o.payload->'attachment'
from message_dispatch_outbox o
where o.payload is not null
  and jsonb_typeof(o.payload) = 'object'
  and jsonb_typeof(o.payload->'attachment') = 'object'
  and octet_length(convert_to((o.payload->'attachment')::text, 'utf8')) > 51200
  and not exists (
    select 1
    from outbox_attachment_backups b
    where b.outbox_id = o.id
  );

update message_dispatch_outbox o
set payload =
  (o.payload - 'attachment') ||
  jsonb_build_object(
    'attachment',
    ((o.payload->'attachment') - 'dataBase64') ||
    jsonb_build_object(
      'attachmentCompacted', true,
      'attachmentOriginalSize', octet_length(convert_to((o.payload->'attachment')::text, 'utf8')),
      'compactedAt', timezone('utc', now())
    )
  ),
  updated_at = timezone('utc', now())
where o.payload is not null
  and jsonb_typeof(o.payload) = 'object'
  and jsonb_typeof(o.payload->'attachment') = 'object'
  and octet_length(convert_to((o.payload->'attachment')::text, 'utf8')) > 51200;
