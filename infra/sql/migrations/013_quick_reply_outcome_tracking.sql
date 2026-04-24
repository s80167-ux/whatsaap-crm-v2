create table if not exists quick_reply_message_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  quick_reply_template_id uuid not null references quick_reply_templates(id) on delete cascade,
  message_id uuid not null unique references messages(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  whatsapp_account_id uuid not null references whatsapp_accounts(id) on delete cascade,
  used_by_organization_user_id uuid references organization_users(id) on delete set null,
  outcome_status text not null default 'sent' check (
    outcome_status in ('sent', 'customer_replied', 'lead_created', 'order_created', 'order_closed_won', 'order_closed_lost')
  ),
  first_response_message_id uuid references messages(id) on delete set null,
  first_response_at timestamptz,
  lead_id uuid references leads(id) on delete set null,
  sales_order_id uuid references sales_orders(id) on delete set null,
  outcome_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_quick_reply_message_events_org_template_status
  on quick_reply_message_events (organization_id, quick_reply_template_id, outcome_status, created_at desc);

create index if not exists idx_quick_reply_message_events_conversation
  on quick_reply_message_events (organization_id, conversation_id, created_at desc);

create index if not exists idx_quick_reply_message_events_contact
  on quick_reply_message_events (organization_id, contact_id, created_at desc);

drop trigger if exists quick_reply_message_events_set_updated_at on quick_reply_message_events;
create trigger quick_reply_message_events_set_updated_at
before update on quick_reply_message_events
for each row execute function set_updated_at();
