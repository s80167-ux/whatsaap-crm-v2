alter table social_channel_accounts
  add column if not exists access_token_encrypted text,
  add column if not exists token_last_verified_at timestamptz,
  add column if not exists token_error_message text;
