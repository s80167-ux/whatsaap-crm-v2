alter table raw_channel_events
  add column if not exists last_attempt_at timestamptz;

create index if not exists idx_raw_events_failed_retry_recovery
  on raw_channel_events (processing_status, retry_count, last_attempt_at, received_at)
  where processing_status = 'failed';

update raw_channel_events
set last_attempt_at = received_at
where last_attempt_at is null
  and processing_status in ('failed', 'processing');