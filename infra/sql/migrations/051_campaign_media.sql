-- ============================================================
-- Migration 051: Campaign Media & Contact Card
-- ============================================================

-- 1. Media attachment storage on campaigns (Base64 inline, same as inbox)
alter table campaigns
  add column if not exists attachment jsonb null,
  add column if not exists message_body_type text not null default 'text'
    check (message_body_type in ('text', 'image', 'video', 'document', 'audio'));

comment on column campaigns.attachment is 'Inline Base64 media payload: { kind, fileName, mimeType, dataBase64, fileSizeBytes }';
comment on column campaigns.message_body_type is 'Derived from attachment.kind or text; simplifies dispatch branching';

-- 2. vCard contact card toggle
alter table campaigns
  add column if not exists attach_contact_card boolean not null default false;

comment on column campaigns.attach_contact_card is 'When true, sends a vCard of the sender WhatsApp account with each campaign message';
