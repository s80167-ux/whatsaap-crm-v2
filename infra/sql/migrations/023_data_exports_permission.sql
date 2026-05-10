insert into role_permissions (role, permission_key)
values
  ('super_admin', 'data_exports.download'),
  ('org_admin', 'data_exports.download')
on conflict (role, permission_key) do nothing;
