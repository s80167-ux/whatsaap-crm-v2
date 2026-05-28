alter table campaign_audience_groups
  add column if not exists crm_save_status text not null default 'not_saved',
  add column if not exists crm_saved_count integer not null default 0,
  add column if not exists crm_created_count integer not null default 0,
  add column if not exists crm_linked_count integer not null default 0,
  add column if not exists crm_skipped_count integer not null default 0,
  add column if not exists crm_save_requested_at timestamptz,
  add column if not exists crm_saved_at timestamptz,
  add column if not exists crm_saved_by uuid,
  add column if not exists storage_status text not null default 'active',
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid,
  add column if not exists details_deleted_at timestamptz,
  add column if not exists details_deleted_by uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'campaign_audience_groups_crm_save_status_check'
  ) then
    alter table campaign_audience_groups
      add constraint campaign_audience_groups_crm_save_status_check
      check (crm_save_status in ('not_saved', 'partially_saved', 'saved', 'failed'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'campaign_audience_groups_storage_status_check'
  ) then
    alter table campaign_audience_groups
      add constraint campaign_audience_groups_storage_status_check
      check (storage_status in ('active', 'archived', 'deleted_details'));
  end if;
end $$;

create table if not exists contact_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  source_type text not null,
  source_ref_id uuid null,
  source_label text null,
  confidence_score numeric(5,2) null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  constraint contact_sources_source_type_check check (
    source_type in ('audience_upload', 'whatsapp_profile', 'inbox_message', 'campaign_reply', 'manual_create')
  )
);

create unique index if not exists contact_sources_contact_source_ref_unique_idx
  on contact_sources (organization_id, contact_id, source_type, source_ref_id)
  where source_ref_id is not null;

create index if not exists contact_sources_organization_contact_idx
  on contact_sources (organization_id, contact_id);

create index if not exists campaign_audience_groups_storage_status_idx
  on campaign_audience_groups (organization_id, storage_status);
