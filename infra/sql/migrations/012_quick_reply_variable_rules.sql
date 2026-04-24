alter table quick_reply_templates
  add column if not exists variable_definitions jsonb not null default '[]'::jsonb;
