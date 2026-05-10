import type { QueryResultRow } from "pg";
import { query } from "../../config/database.js";

export type ExportDataset = "contacts" | "conversations" | "messages" | "sales" | "campaigns";

export type ExportFilters = {
  organizationId: string;
  createdFrom?: string;
  createdTo?: string;
  whatsappAccountId?: string;
  assignedUserId?: string;
};

type ExportDefinition = {
  filenamePrefix: string;
  headers: string[];
  sql: string;
  buildValues: (filters: ExportFilters) => unknown[];
};

function addDateFilter(parts: string[], values: unknown[], columnName: string, filters: ExportFilters) {
  if (filters.createdFrom) {
    values.push(filters.createdFrom);
    parts.push(`${columnName} >= $${values.length}`);
  }

  if (filters.createdTo) {
    values.push(filters.createdTo);
    parts.push(`${columnName} < ($${values.length}::date + interval '1 day')`);
  }
}

function addOptionalFilter(parts: string[], values: unknown[], columnName: string, value?: string) {
  if (!value) {
    return;
  }

  values.push(value);
  parts.push(`${columnName} = $${values.length}`);
}

function buildWhere(filters: ExportFilters, input: {
  baseColumn?: string;
  dateColumn: string;
  whatsappColumn?: string;
  assignedColumn?: string;
}) {
  const values: unknown[] = [filters.organizationId];
  const parts = [`${input.baseColumn ?? "organization_id"} = $1`];

  addDateFilter(parts, values, input.dateColumn, filters);

  if (input.whatsappColumn) {
    addOptionalFilter(parts, values, input.whatsappColumn, filters.whatsappAccountId);
  }

  if (input.assignedColumn) {
    addOptionalFilter(parts, values, input.assignedColumn, filters.assignedUserId);
  }

  return {
    whereSql: parts.join(" and "),
    values
  };
}

const definitions: Record<ExportDataset, ExportDefinition> = {
  contacts: {
    filenamePrefix: "contacts",
    headers: [
      "Contact ID",
      "Display Name",
      "Phone",
      "Email",
      "Company",
      "Lifecycle Status",
      "Owner",
      "Notes",
      "Created At",
      "Updated At",
      "Last Activity At"
    ],
    sql: "",
    buildValues: (filters) => buildWhere(filters, { baseColumn: "c.organization_id", dateColumn: "c.created_at", assignedColumn: "c.owner_user_id" }).values
  },
  conversations: {
    filenamePrefix: "conversations",
    headers: [
      "Conversation ID",
      "Contact",
      "Contact Phone",
      "WhatsApp Account",
      "Status",
      "Assigned User",
      "First Message At",
      "Last Message At",
      "Unread Count",
      "Created At",
      "Updated At"
    ],
    sql: "",
    buildValues: (filters) =>
      buildWhere(filters, {
        baseColumn: "cv.organization_id",
        dateColumn: "coalesce(cv.last_message_at, cv.created_at)",
        whatsappColumn: "cv.whatsapp_account_id",
        assignedColumn: "cv.assigned_user_id"
      }).values
  },
  messages: {
    filenamePrefix: "messages",
    headers: [
      "Message ID",
      "Conversation ID",
      "Contact",
      "Contact Phone",
      "WhatsApp Account",
      "Direction",
      "Message Type",
      "Content",
      "Ack Status",
      "Sent At",
      "Delivered At",
      "Read At",
      "Failed At",
      "Created At"
    ],
    sql: "",
    buildValues: (filters) =>
      buildWhere(filters, {
        baseColumn: "m.organization_id",
        dateColumn: "coalesce(m.sent_at, m.created_at)",
        whatsappColumn: "m.whatsapp_account_id",
        assignedColumn: "cv.assigned_user_id"
      }).values
  },
  sales: {
    filenamePrefix: "sales",
    headers: [
      "Sales Order ID",
      "Contact",
      "Contact Phone",
      "Lead Source",
      "Status",
      "Total Amount",
      "Currency",
      "Assigned User",
      "Item Count",
      "Closed At",
      "Created At",
      "Updated At"
    ],
    sql: "",
    buildValues: (filters) =>
      buildWhere(filters, {
        baseColumn: "so.organization_id",
        dateColumn: "so.created_at",
        assignedColumn: "so.assigned_user_id"
      }).values
  },
  campaigns: {
    filenamePrefix: "campaigns",
    headers: [
      "Campaign ID",
      "Name",
      "Status",
      "Audience Group",
      "WhatsApp Account",
      "Speed Preset",
      "Daily Limit",
      "Recipients",
      "Queued",
      "Sent",
      "Failed",
      "Skipped",
      "Created At",
      "Updated At"
    ],
    sql: "",
    buildValues: (filters) =>
      buildWhere(filters, {
        baseColumn: "cp.organization_id",
        dateColumn: "cp.created_at",
        whatsappColumn: "cp.sender_whatsapp_account_id"
      }).values
  }
};

function getContactsSql(filters: ExportFilters) {
  const { whereSql } = buildWhere(filters, { baseColumn: "c.organization_id", dateColumn: "c.created_at", assignedColumn: "c.owner_user_id" });

  return `
    select
      c.id,
      c.display_name,
      c.primary_phone_e164,
      c.email,
      c.company_name,
      c.lifecycle_status,
      owner.full_name as owner_name,
      c.notes,
      c.created_at,
      c.updated_at,
      c.last_activity_at
    from contacts c
    left join organization_users owner on owner.id = c.owner_user_id
    where ${whereSql}
    order by c.created_at desc
  `;
}

function getConversationsSql(filters: ExportFilters) {
  const { whereSql } = buildWhere(filters, {
    baseColumn: "cv.organization_id",
    dateColumn: "coalesce(cv.last_message_at, cv.created_at)",
    whatsappColumn: "cv.whatsapp_account_id",
    assignedColumn: "cv.assigned_user_id"
  });

  return `
    select
      cv.id,
      c.display_name as contact_name,
      c.primary_phone_e164 as contact_phone,
      coalesce(wa.display_name, wa.label, wa.account_phone_e164) as whatsapp_account,
      cv.status,
      assignee.full_name as assigned_user,
      cv.first_message_at,
      cv.last_message_at,
      cv.unread_count,
      cv.created_at,
      cv.updated_at
    from conversations cv
    join contacts c on c.id = cv.contact_id
    left join whatsapp_accounts wa on wa.id = cv.whatsapp_account_id
    left join organization_users assignee on assignee.id = cv.assigned_user_id
    where ${whereSql}
    order by coalesce(cv.last_message_at, cv.created_at) desc
  `;
}

function getMessagesSql(filters: ExportFilters) {
  const { whereSql } = buildWhere(filters, {
    baseColumn: "m.organization_id",
    dateColumn: "coalesce(m.sent_at, m.created_at)",
    whatsappColumn: "m.whatsapp_account_id",
    assignedColumn: "cv.assigned_user_id"
  });

  return `
    select
      m.id,
      m.conversation_id,
      c.display_name as contact_name,
      c.primary_phone_e164 as contact_phone,
      coalesce(wa.display_name, wa.label, wa.account_phone_e164) as whatsapp_account,
      m.direction,
      m.message_type,
      m.content_text,
      m.ack_status,
      m.sent_at,
      m.delivered_at,
      m.read_at,
      m.failed_at,
      m.created_at
    from messages m
    join conversations cv on cv.id = m.conversation_id
    join contacts c on c.id = m.contact_id
    left join whatsapp_accounts wa on wa.id = m.whatsapp_account_id
    where ${whereSql}
    order by coalesce(m.sent_at, m.created_at) desc
  `;
}

function getSalesSql(filters: ExportFilters) {
  const { whereSql } = buildWhere(filters, {
    baseColumn: "so.organization_id",
    dateColumn: "so.created_at",
    assignedColumn: "so.assigned_user_id"
  });

  return `
    select
      so.id,
      c.display_name as contact_name,
      c.primary_phone_e164 as contact_phone,
      l.source as lead_source,
      so.status,
      so.total_amount,
      so.currency,
      assignee.full_name as assigned_user,
      count(soi.id) as item_count,
      so.closed_at,
      so.created_at,
      so.updated_at
    from sales_orders so
    join contacts c on c.id = so.contact_id
    left join leads l on l.id = so.lead_id
    left join organization_users assignee on assignee.id = so.assigned_user_id
    left join sales_order_items soi on soi.sales_order_id = so.id
    where ${whereSql}
    group by so.id, c.display_name, c.primary_phone_e164, l.source, assignee.full_name
    order by so.created_at desc
  `;
}

function getCampaignsSql(filters: ExportFilters) {
  const { whereSql } = buildWhere(filters, {
    baseColumn: "cp.organization_id",
    dateColumn: "cp.created_at",
    whatsappColumn: "cp.sender_whatsapp_account_id"
  });

  return `
    select
      cp.id,
      cp.name,
      cp.status,
      ag.name as audience_group,
      coalesce(wa.display_name, wa.label, wa.account_phone_e164) as whatsapp_account,
      cp.speed_preset,
      cp.daily_limit,
      count(cr.id) as recipients,
      count(cr.id) filter (where cr.send_status = 'queued') as queued,
      count(cr.id) filter (where cr.send_status = 'sent') as sent,
      count(cr.id) filter (where cr.send_status = 'failed') as failed,
      count(cr.id) filter (where cr.send_status = 'skipped') as skipped,
      cp.created_at,
      cp.updated_at
    from campaigns cp
    left join campaign_audience_groups ag on ag.id = cp.audience_group_id
    left join whatsapp_accounts wa on wa.id = cp.sender_whatsapp_account_id
    left join campaign_recipients cr on cr.campaign_id = cp.id
    where ${whereSql}
    group by cp.id, ag.name, wa.display_name, wa.label, wa.account_phone_e164
    order by cp.created_at desc
  `;
}

function getSql(dataset: ExportDataset, filters: ExportFilters) {
  switch (dataset) {
    case "contacts":
      return getContactsSql(filters);
    case "conversations":
      return getConversationsSql(filters);
    case "messages":
      return getMessagesSql(filters);
    case "sales":
      return getSalesSql(filters);
    case "campaigns":
      return getCampaignsSql(filters);
  }
}

function formatCsvValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function toCsv(headers: string[], rows: QueryResultRow[]) {
  const csvRows = [
    headers,
    ...rows.map((row) => Object.values(row).map(formatCsvValue))
  ];

  return csvRows
    .map((row) =>
      row
        .map((cell) => {
          const escaped = cell.replace(/"/g, '""');
          return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped;
        })
        .join(",")
    )
    .join("\r\n");
}

function formatDateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export class ExportService {
  async createCsv(dataset: ExportDataset, filters: ExportFilters) {
    const definition = definitions[dataset];
    const result = await query(getSql(dataset, filters), definition.buildValues(filters));

    return {
      csv: toCsv(definition.headers, result.rows),
      rowCount: result.rowCount,
      filename: `${definition.filenamePrefix}-${formatDateStamp()}.csv`
    };
  }
}
