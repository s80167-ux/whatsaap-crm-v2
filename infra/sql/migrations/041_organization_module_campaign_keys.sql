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
        'ai_message_assist'
      )
    );
end $$;
