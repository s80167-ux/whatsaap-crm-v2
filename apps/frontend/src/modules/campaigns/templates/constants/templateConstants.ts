import type { MessageTemplateCategory, MessageTemplateVariable } from "../types/template.types";

export const templateCategories: MessageTemplateCategory[] = [
  "Promotion",
  "Reminder",
  "Follow Up",
  "Re-engagement",
  "Announcement",
  "Support",
  "Custom"
];

export const configurableTemplateVariables: MessageTemplateVariable[] = [
  { key: "customer_name", label: "Customer name", sampleValue: "Ahmad" },
  { key: "first_name", label: "First name", sampleValue: "Ahmad" },
  { key: "company_name", label: "Company name", sampleValue: "Rezeki Mart" },
  { key: "phone", label: "Phone", sampleValue: "+60123456789" }
];

export const defaultTemplateContent = "Hi {{customer_name}},\n\n";
