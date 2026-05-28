import type { DashboardProvider } from "./types.js";
import { createWidget } from "./types.js";

export const crmDashboardProvider: DashboardProvider = {
  moduleKey: "crm",
  title: "CRM",
  description: "Contact base quality and ownership signals.",
  priority: 20,
  async getWidget(authUser, client, context) {
    const organizationId = context.organizationId;
    if (!organizationId) {
      return createWidget({
        id: "crm",
        moduleKey: "crm",
        title: this.title,
        description: this.description,
        status: "empty",
        priority: this.priority,
        href: "/contacts",
        metrics: [],
        alerts: [{ severity: "info", message: "Select an organization to view CRM health." }],
        quickActions: [],
        updatedAt: context.generatedAt
      });
    }

    const ownedOnly = context.scope === "agent" && authUser.organizationUserId;
    const contactScope = ownedOnly
      ? `and (
          owner_user_id = $2
          or exists (
            select 1
            from contact_owners co
            where co.contact_id = contacts.id
              and co.organization_user_id = $2
          )
        )`
      : "";
    const params = ownedOnly ? [organizationId, authUser.organizationUserId] : [organizationId];
    const phoneColumnResult = await client.query<{ column_name: string }>(
      `
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'contacts'
          and column_name in ('phone_primary_normalized', 'primary_phone_normalized', 'primary_phone_e164')
      `
    );
    const phoneColumns = new Set(phoneColumnResult.rows.map((row) => row.column_name));
    const duplicatePhoneColumn = phoneColumns.has("phone_primary_normalized")
      ? "phone_primary_normalized"
      : phoneColumns.has("primary_phone_normalized")
        ? "primary_phone_normalized"
        : phoneColumns.has("primary_phone_e164")
          ? "primary_phone_e164"
          : null;

    const [contacts, unknownContacts, duplicatePhones] = await Promise.all([
      client.query<{ count: string }>(
        `select count(*)::text as count from contacts where organization_id = $1 ${contactScope}`,
        params
      ),
      client.query<{ count: string }>(
        `
          select count(*)::text as count
          from contacts
          where organization_id = $1
            and (
              nullif(trim(display_name), '') is null
              or lower(trim(display_name)) in ('unknown', 'customer', 'no name', 'whatsapp', 'business', 'user', 'contact')
            )
            ${contactScope}
        `,
        params
      ),
      duplicatePhoneColumn
        ? client.query<{ count: string }>(
            `
              select count(*)::text as count
              from (
                select ${duplicatePhoneColumn}
                from contacts
                where organization_id = $1
                  and ${duplicatePhoneColumn} is not null
                group by ${duplicatePhoneColumn}
                having count(*) > 1
              ) duplicates
            `,
            [organizationId]
          )
        : Promise.resolve({ rows: [{ count: "0" }] })
    ]);

    const totalContacts = Number(contacts.rows[0]?.count ?? 0);
    const unknown = Number(unknownContacts.rows[0]?.count ?? 0);
    const duplicate = Number(duplicatePhones.rows[0]?.count ?? 0);
    const alerts = [
      ...(unknown > 0
        ? [{ severity: "warning" as const, message: `${unknown} contacts need a cleaner name or identity.`, href: "/contacts/reliability" }]
        : []),
      ...(duplicate > 0
        ? [{ severity: "warning" as const, message: `${duplicate} phone number${duplicate === 1 ? "" : "s"} appear on duplicate contacts.`, href: "/contacts/reliability" }]
        : [])
    ];

    return createWidget({
      id: "crm",
      moduleKey: "crm",
      title: this.title,
      description: this.description,
      status: totalContacts === 0 ? "empty" : alerts.length ? "warning" : "healthy",
      priority: this.priority,
      href: "/contacts",
      metrics: [
        { label: "Total contacts", value: totalContacts, href: "/contacts", tone: "primary" },
        { label: "Reliability issues", value: unknown + duplicate, href: "/contacts/reliability", tone: unknown + duplicate > 0 ? "warning" : "success" },
        { label: "Unknown contacts", value: unknown, href: "/contacts/reliability" }
      ],
      alerts,
      quickActions: [
        { label: "View Contacts", href: "/contacts", variant: "primary" },
        { label: "Contact Recovery", href: "/contacts/reliability", variant: "secondary" }
      ],
      updatedAt: context.generatedAt
    });
  }
};
