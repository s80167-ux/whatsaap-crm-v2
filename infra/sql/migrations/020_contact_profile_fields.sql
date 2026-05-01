alter table contacts
  add column if not exists email text,
  add column if not exists company_name text,
  add column if not exists notes text;
