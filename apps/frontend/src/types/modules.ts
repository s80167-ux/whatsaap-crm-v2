export type ModuleKey = "campaigns";

export interface OrganizationModule {
  id: string;
  organization_id: string;
  module_key: ModuleKey;
  is_enabled: boolean;
  enabled_by: string | null;
  enabled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationModuleStatus {
  organizationId: string;
  moduleKey: ModuleKey;
  isEnabled: boolean;
}
