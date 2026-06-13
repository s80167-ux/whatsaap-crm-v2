create extension if not exists pgcrypto;

alter table campaign_audience_groups
  add column if not exists source_type text null,
  add column if not exists permission_status text not null default 'not_verified_by_system',
  add column if not exists risk_level text not null default 'medium',
  add column if not exists suppressed_count integer not null default 0;

alter table campaign_audience_groups
  drop constraint if exists campaign_audience_groups_source_type_check;

alter table campaign_audience_groups
  add constraint campaign_audience_groups_source_type_check
  check (
    source_type is null
    or source_type in (
      'existing_customers',
      'form_or_register_leads',
      'event_booth_walkin',
      'previous_whatsapp_contact',
      'referral_partner_list',
      'cold_public_list',
      'not_sure'
    )
  );

alter table campaign_audience_groups
  drop constraint if exists campaign_audience_groups_permission_status_check;

alter table campaign_audience_groups
  add constraint campaign_audience_groups_permission_status_check
  check (permission_status in ('not_verified_by_system', 'declared_by_user', 'crm_verified'));

alter table campaign_audience_groups
  drop constraint if exists campaign_audience_groups_risk_level_check;

alter table campaign_audience_groups
  add constraint campaign_audience_groups_risk_level_check
  check (risk_level in ('low', 'medium', 'high'));

alter table campaign_audience_contacts
  add column if not exists updated_at timestamptz not null default timezone('utc', now()),
  add column if not exists raw_data_json jsonb not null default '{}'::jsonb,
  add column if not exists exclude_reason text null,
  add column if not exists matched_contact_id uuid null references contacts(id) on delete set null,
  add column if not exists suppressed_source text null;

update campaign_audience_contacts
set matched_contact_id = coalesce(matched_contact_id, crm_contact_id)
where crm_contact_id is not null
  and matched_contact_id is null;

create table if not exists suppression_list (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  phone text not null,
  normalized_phone text not null,
  reason text not null,
  source_campaign_id uuid null references campaigns(id) on delete set null,
  created_by uuid null references organization_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists suppression_list_org_phone_unique_idx
  on suppression_list (organization_id, normalized_phone);

create index if not exists suppression_list_org_reason_idx
  on suppression_list (organization_id, reason);

alter table campaigns
  add column if not exists selected_message_template_id uuid null,
  add column if not exists active_safety_review_id uuid null,
  add column if not exists active_message_override_id uuid null;

alter table campaign_recipients
  add column if not exists updated_at timestamptz not null default timezone('utc', now()),
  add column if not exists message_body_rendered text null,
  add column if not exists delivered_at timestamptz null,
  add column if not exists replied_at timestamptz null,
  add column if not exists opt_out_detected boolean not null default false;

alter table campaign_recipients
  drop constraint if exists campaign_recipients_send_status_check;

alter table campaign_recipients
  add constraint campaign_recipients_send_status_check
  check (send_status in ('pending', 'queued', 'sending', 'sent', 'failed', 'skipped', 'opted_out'));

create table if not exists campaign_safety_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  audience_risk_snapshot jsonb not null default '{}'::jsonb,
  template_risk_snapshot jsonb not null default '{}'::jsonb,
  sender_risk_snapshot jsonb not null default '{}'::jsonb,
  tempo_risk_snapshot jsonb not null default '{}'::jsonb,
  overall_risk_level text not null,
  detected_issues_json jsonb not null default '[]'::jsonb,
  suggested_actions_json jsonb not null default '[]'::jsonb,
  user_decision text not null default 'pending',
  reviewed_by uuid null references organization_users(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint campaign_safety_reviews_overall_risk_level_check
    check (overall_risk_level in ('low', 'medium', 'high')),
  constraint campaign_safety_reviews_user_decision_check
    check (user_decision in ('pending', 'applied_suggestions', 'partially_applied', 'ignored_warning', 'saved_as_draft'))
);

create index if not exists campaign_safety_reviews_campaign_idx
  on campaign_safety_reviews (campaign_id, created_at desc);

create table if not exists campaign_message_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  template_id uuid null,
  original_body text not null,
  override_body text not null,
  created_from_suggestion boolean not null default false,
  approved_by uuid null references organization_users(id) on delete set null,
  approved_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists campaign_message_overrides_campaign_unique_idx
  on campaign_message_overrides (campaign_id);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'campaigns'
      and column_name = 'active_safety_review_id'
  ) then
    begin
      alter table campaigns
        add constraint campaigns_active_safety_review_fk
        foreign key (active_safety_review_id)
        references campaign_safety_reviews(id)
        on delete set null;
    exception
      when duplicate_object then null;
    end;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_name = 'campaigns'
      and column_name = 'active_message_override_id'
  ) then
    begin
      alter table campaigns
        add constraint campaigns_active_message_override_fk
        foreign key (active_message_override_id)
        references campaign_message_overrides(id)
        on delete set null;
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_proc
    where proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'campaign_audience_contacts_set_updated_at') then
      create trigger campaign_audience_contacts_set_updated_at
      before update on campaign_audience_contacts
      for each row execute function set_updated_at();
    end if;

    if not exists (select 1 from pg_trigger where tgname = 'campaign_recipients_set_updated_at') then
      create trigger campaign_recipients_set_updated_at
      before update on campaign_recipients
      for each row execute function set_updated_at();
    end if;
  end if;
end $$;
