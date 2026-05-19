import type { MessageTemplate, TemplateFormDraft, TemplateStats } from "../types/template.types";
import { extractTemplateVariables } from "../utils/templateVariables";

const storageKey = "whatsapp-crm-message-templates";

const mockTemplates: MessageTemplate[] = [
  {
    id: "template-001",
    organization_id: null,
    name: "Monthly Promo Reminder",
    category: "Promotion",
    description: "Reusable offer message for warm customers.",
    content: "Hi {{customer_name}},\nPromo khas untuk anda di {{company_name}} minggu ini.",
    attachments: [],
    variables: ["customer_name", "company_name"],
    status: "Active",
    created_by: null,
    created_at: "2026-05-01T09:30:00.000Z",
    updated_at: "2026-05-10T10:15:00.000Z",
    archived_at: null
  },
  {
    id: "template-002",
    organization_id: null,
    name: "Appointment Reminder",
    category: "Reminder",
    description: "Short follow-up before a scheduled appointment.",
    content: "Hi {{first_name}}, this is a friendly reminder from {{company_name}}.",
    attachments: [],
    variables: ["first_name", "company_name"],
    status: "Active",
    created_by: null,
    created_at: "2026-04-28T06:45:00.000Z",
    updated_at: "2026-05-09T08:00:00.000Z",
    archived_at: null
  },
  {
    id: "template-003",
    organization_id: null,
    name: "Dormant Lead Check-in",
    category: "Re-engagement",
    description: "Reconnect with older leads without a hard sell.",
    content: "Hi {{customer_name}}, just checking in to see if you still need help from our team.",
    attachments: [],
    variables: ["customer_name"],
    status: "Draft",
    created_by: null,
    created_at: "2026-04-20T03:20:00.000Z",
    updated_at: "2026-05-05T04:10:00.000Z",
    archived_at: null
  }
];

export async function fetchMessageTemplates(organizationId?: string | null) {
  const templates = readTemplates();

  if (!organizationId) {
    return templates;
  }

  return templates.filter((template) => template.organization_id === organizationId || template.organization_id === null);
}

export async function createMessageTemplate(input: TemplateFormDraft & { organizationId?: string | null }) {
  const now = new Date().toISOString();
  const template: MessageTemplate = {
    id: `template-${Date.now()}`,
    organization_id: input.organizationId ?? null,
    name: input.name.trim(),
    category: input.category,
    description: input.description.trim() || null,
    content: input.content,
    attachments: input.attachments,
    variables: extractTemplateVariables(input.content),
    status: input.status,
    created_by: null,
    created_at: now,
    updated_at: now,
    archived_at: input.status === "Archived" ? now : null
  };

  writeTemplates([template, ...readTemplates()]);
  return template;
}

export async function updateMessageTemplate(input: TemplateFormDraft & { templateId: string }) {
  return updateTemplate(input.templateId, (template) => {
    const now = new Date().toISOString();

    return {
      ...template,
      name: input.name.trim(),
      category: input.category,
      description: input.description.trim() || null,
      content: input.content,
      attachments: input.attachments,
      variables: extractTemplateVariables(input.content),
      status: input.status,
      updated_at: now,
      archived_at: input.status === "Archived" ? template.archived_at ?? now : null
    };
  });
}

export async function duplicateMessageTemplate(templateId: string) {
  const templates = readTemplates();
  const source = templates.find((template) => template.id === templateId);

  if (!source) {
    throw new Error("Template not found.");
  }

  const now = new Date().toISOString();
  const duplicate: MessageTemplate = {
    ...source,
    id: `template-${Date.now()}`,
    name: `${source.name} Copy`,
    status: "Draft",
    created_at: now,
    updated_at: now,
    archived_at: null
  };

  writeTemplates([duplicate, ...templates]);
  return duplicate;
}

export async function archiveMessageTemplate(templateId: string) {
  return updateTemplate(templateId, (template) => ({
    ...template,
    status: "Archived",
    archived_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));
}

export async function deleteMessageTemplate(templateId: string) {
  const templates = readTemplates();
  writeTemplates(templates.filter((template) => template.id !== templateId));
  return { ok: true };
}

export function getTemplateStats(templates: MessageTemplate[]): TemplateStats {
  return {
    total: templates.length,
    active: templates.filter((template) => template.status === "Active").length,
    draft: templates.filter((template) => template.status === "Draft").length,
    archived: templates.filter((template) => template.status === "Archived").length
  };
}

function updateTemplate(templateId: string, updater: (template: MessageTemplate) => MessageTemplate) {
  const templates = readTemplates();
  const nextTemplates = templates.map((template) => (template.id === templateId ? updater(template) : template));
  const updated = nextTemplates.find((template) => template.id === templateId);

  if (!updated) {
    throw new Error("Template not found.");
  }

  writeTemplates(nextTemplates);
  return updated;
}

function readTemplates() {
  if (typeof window === "undefined") {
    return mockTemplates;
  }

  const stored = window.localStorage.getItem(storageKey);

  if (!stored) {
    writeTemplates(mockTemplates);
    return mockTemplates;
  }

  try {
    return JSON.parse(stored) as MessageTemplate[];
  } catch {
    writeTemplates(mockTemplates);
    return mockTemplates;
  }
}

function writeTemplates(templates: MessageTemplate[]) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(storageKey, JSON.stringify(templates));
  }
}
