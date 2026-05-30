-- ============================================================
-- Migration 050: P0 Anti-Ban Suite
-- ============================================================
-- Adds columns needed for account warm-up, real health scoring,
-- and ban detection.

-- 1. WhatsApp account warm-up tracking
alter table whatsapp_accounts
  add column if not exists warmup_level integer not null default 0,
  add column if not exists warmup_started_at timestamptz;

comment on column whatsapp_accounts.warmup_level is '0=not started, 1=day 1-2 (20/day), 2=day 3-4 (50/day), 3=day 5-7 (100/day), 4=day 8-10 (200/day), 5=day 11-14 (300/day), 6=day 15+ (base limit)';
comment on column whatsapp_accounts.warmup_started_at is 'Timestamp when the account first sent a campaign message; warm-up tiers are calculated from this date';

-- 2. Health score computation tracking
alter table whatsapp_accounts
  add column if not exists health_score_computed_at timestamptz;

comment on column whatsapp_accounts.health_score_computed_at is 'Last time the health score was computed from rolling 7-day delivery metrics';

-- 3. Campaign recipients: track read/delivered at for faster health queries
-- (These are denormalized from message_status_events for campaign-level analytics.)
alter table campaign_recipients
  add column if not exists read_at timestamptz,
  add column if not exists delivered_at timestamptz;

-- 4. Index for health-score query hot path
create index if not exists idx_campaign_recipients_account_attempt
  on campaign_recipients (assigned_whatsapp_account_id, last_attempt_at)
  where send_status = 'sent';

-- 5. Index for warm-up daily sent count lookup
-- Note: partial index with now() is not allowed (non-immutable), so we use a regular composite index
create index if not exists idx_campaign_recipients_account_sent
  on campaign_recipients (assigned_whatsapp_account_id, sent_at desc);
