export type MessageTemplateCategory =
  | "Promotion"
  | "Reminder"
  | "Follow Up"
  | "Re-engagement"
  | "Announcement"
  | "Support"
  | "Custom";

export type MessageTemplateStatus = "Active" | "Draft" | "Archived";

export type MessageTemplateVariable = {
  key: string;
  label: string;
  sampleValue: string;
};

export type MessageTemplate = {
  id: string;
  organization_id: string | null;
  name: string;
  category: MessageTemplateCategory;
  description?: string | null;
  content: string;
  variables: string[];
  status: MessageTemplateStatus;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
};

export type TemplateFormDraft = {
  name: string;
  category: MessageTemplateCategory;
  description: string;
  content: string;
  status: MessageTemplateStatus;
};

export type TemplateStats = {
  total: number;
  active: number;
  draft: number;
  archived: number;
};
