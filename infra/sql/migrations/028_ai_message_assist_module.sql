do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'organization_modules_module_key_supported'
  ) then
    alter table organization_modules
      drop constraint organization_modules_module_key_supported;
  end if;

  alter table organization_modules
    add constraint organization_modules_module_key_supported
    check (module_key in ('campaigns', 'ai_message_assist'));
end $$;

insert into organization_modules (
  organization_id,
  module_key,
  is_enabled,
  updated_at
)
select
  id,
  'ai_message_assist',
  false,
  timezone('utc', now())
from organizations
on conflict (organization_id, module_key) do nothing;
