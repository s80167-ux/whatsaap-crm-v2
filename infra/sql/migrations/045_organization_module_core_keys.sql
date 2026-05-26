do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'organization_modules_module_key_supported'
      and conrelid = 'organization_modules'::regclass
  ) then
    alter table organization_modules
      drop constraint organization_modules_module_key_supported;
  end if;

  alter table organization_modules
    add constraint organization_modules_module_key_supported
    check (
      module_key in (
        'campaigns',
        'campaign',
        'campaign.whatsapp',
        'campaign.email',
        'ai_message_assist',
        'inbox',
        'crm',
        'sales'
      )
    );
end $$;

insert into organization_modules (
  organization_id,
  module_key,
  is_enabled,
  enabled_by,
  enabled_at,
  updated_at
)
select organizations.id, modules.module_key, true, null, timezone('utc', now()), timezone('utc', now())
from organizations
cross join (
  values ('inbox'), ('crm'), ('sales')
) modules(module_key)
on conflict (organization_id, module_key) do nothing;
