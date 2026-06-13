-- ============================================================
-- Migration 055: Campaign media asset references and message guards
-- ============================================================
--
-- Keep this migration lightweight. Historical message/outbox compaction can be
-- very expensive on large datasets, so we install the runtime guards here and
-- expose batch helpers for a controlled follow-up backfill.

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

create unique index if not exists idx_message_outbound_media_backups_message_id
  on message_outbound_media_backups (message_id);

create table if not exists outbox_attachment_backups (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references message_dispatch_outbox(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  attachment jsonb not null,
  backed_up_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_outbox_attachment_backups_outbox_id
  on outbox_attachment_backups (outbox_id);

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

create or replace function backfill_message_outbound_media_compaction(batch_size integer default 200)
returns integer
language plpgsql
as $$
declare
  processed_count integer := 0;
begin
  if coalesce(batch_size, 0) <= 0 then
    raise exception 'batch_size must be greater than 0';
  end if;

  with candidates as (
    select
      m.id,
      m.organization_id,
      m.content_json->'outboundMedia' as outbound_media,
      octet_length(convert_to((m.content_json->'outboundMedia')::text, 'utf8')) as outbound_media_size
    from messages m
    where m.content_json is not null
      and jsonb_typeof(m.content_json) = 'object'
      and jsonb_typeof(m.content_json->'outboundMedia') = 'object'
      and coalesce((m.content_json->'outboundMedia'->>'outboundMediaCompacted')::boolean, false) = false
      and octet_length(convert_to((m.content_json->'outboundMedia')::text, 'utf8')) > 51200
    order by m.created_at, m.id
    limit batch_size
  ), backups as (
    insert into message_outbound_media_backups (message_id, organization_id, outbound_media)
    select c.id, c.organization_id, c.outbound_media
    from candidates c
    on conflict (message_id) do nothing
  ), updated as (
    update messages m
    set content_json =
      (m.content_json - 'outboundMedia') ||
      jsonb_build_object(
        'outboundMedia',
        (c.outbound_media - 'dataBase64') ||
        jsonb_build_object(
          'outboundMediaCompacted', true,
          'outboundMediaOriginalSize', c.outbound_media_size,
          'compactedAt', timezone('utc', now())
        )
      ),
      updated_at = timezone('utc', now())
    from candidates c
    where m.id = c.id
    returning 1
  )
  select count(*) into processed_count from updated;

  return processed_count;
end;
$$;

comment on function backfill_message_outbound_media_compaction(integer)
  is 'Manual batch helper. Run repeatedly after deploy until it returns 0.';

create or replace function backfill_outbox_attachment_compaction(batch_size integer default 200)
returns integer
language plpgsql
as $$
declare
  processed_count integer := 0;
begin
  if coalesce(batch_size, 0) <= 0 then
    raise exception 'batch_size must be greater than 0';
  end if;

  with candidates as (
    select
      o.id,
      o.organization_id,
      o.payload->'attachment' as attachment,
      octet_length(convert_to((o.payload->'attachment')::text, 'utf8')) as attachment_size
    from message_dispatch_outbox o
    where o.payload is not null
      and jsonb_typeof(o.payload) = 'object'
      and jsonb_typeof(o.payload->'attachment') = 'object'
      and coalesce((o.payload->'attachment'->>'attachmentCompacted')::boolean, false) = false
      and octet_length(convert_to((o.payload->'attachment')::text, 'utf8')) > 51200
    order by o.created_at, o.id
    limit batch_size
  ), backups as (
    insert into outbox_attachment_backups (outbox_id, organization_id, attachment)
    select c.id, c.organization_id, c.attachment
    from candidates c
    on conflict (outbox_id) do nothing
  ), updated as (
    update message_dispatch_outbox o
    set payload =
      (o.payload - 'attachment') ||
      jsonb_build_object(
        'attachment',
        (c.attachment - 'dataBase64') ||
        jsonb_build_object(
          'attachmentCompacted', true,
          'attachmentOriginalSize', c.attachment_size,
          'compactedAt', timezone('utc', now())
        )
      ),
      updated_at = timezone('utc', now())
    from candidates c
    where o.id = c.id
    returning 1
  )
  select count(*) into processed_count from updated;

  return processed_count;
end;
$$;

comment on function backfill_outbox_attachment_compaction(integer)
  is 'Manual batch helper. Run repeatedly after deploy until it returns 0.';
