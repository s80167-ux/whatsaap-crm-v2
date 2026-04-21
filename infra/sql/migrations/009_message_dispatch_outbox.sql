create table if not exists message_dispatch_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  message_id uuid not null unique references messages(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  whatsapp_account_id uuid not null references whatsapp_accounts(id) on delete cascade,
  recipient_jid text not null,
  message_text text not null,
  payload jsonb,
  processing_status text not null default 'pending' check (processing_status in ('pending', 'processing', 'dispatched', 'failed')),
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  claimed_at timestamptz,
  dispatched_at timestamptz,
  connector_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_message_dispatch_outbox_status_next_attempt
  on message_dispatch_outbox (processing_status, next_attempt_at, created_at);

create index if not exists idx_message_dispatch_outbox_account_status
  on message_dispatch_outbox (whatsapp_account_id, processing_status, created_at desc);

drop trigger if exists message_dispatch_outbox_set_updated_at on message_dispatch_outbox;
create trigger message_dispatch_outbox_set_updated_at
before update on message_dispatch_outbox
for each row execute function set_updated_at();
