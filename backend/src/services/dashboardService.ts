import { pool } from "../config/database.js";
import type { AuthUser } from "../types/auth.js";

type DashboardSummary = {
  scope: "agent" | "admin" | "super_admin";
  metrics: Array<{
    label: string;
    value: number | string;
    hint: string;
  }>;
};

export class DashboardService {
  async getAgentDashboard(authUser: AuthUser): Promise<DashboardSummary> {
    if (!authUser.organizationId || !authUser.organizationUserId) {
      throw new Error("organization_id is required");
    }

    const client = await pool.connect();
    try {
      const [assignedConversations, ownedContacts, outboundToday] = await Promise.all([
        client.query<{ count: string }>(
          `
            select count(*)::text as count
            from conversations
            where organization_id = $1
              and (
                assigned_user_id = $2
                or exists (
                  select 1
                  from conversation_assignments ca
                  where ca.conversation_id = conversations.id
                    and ca.organization_user_id = $2
                )
              )
          `,
          [authUser.organizationId, authUser.organizationUserId]
        ),
        client.query<{ count: string }>(
          `
            select count(*)::text as count
            from contacts
            where organization_id = $1
              and (
                owner_user_id = $2
                or exists (
                  select 1
                  from contact_owners co
                  where co.contact_id = contacts.id
                    and co.organization_user_id = $2
                )
              )
          `,
          [authUser.organizationId, authUser.organizationUserId]
        ),
        client.query<{ count: string }>(
          `
            select count(*)::text as count
            from messages
            where organization_id = $1
              and direction = 'outgoing'
              and sent_at >= date_trunc('day', timezone('utc', now()))
              and conversation_id in (
                select c.id
                from conversations c
                where c.organization_id = $1
                  and (
                    c.assigned_user_id = $2
                    or exists (
                      select 1
                      from conversation_assignments ca
                      where ca.conversation_id = c.id
                        and ca.organization_user_id = $2
                    )
                  )
              )
          `,
          [authUser.organizationId, authUser.organizationUserId]
        )
      ]);

      return {
        scope: "agent",
        metrics: [
          {
            label: "Assigned conversations",
            value: Number(assignedConversations.rows[0]?.count ?? 0),
            hint: "Threads currently routed to you"
          },
          {
            label: "Owned contacts",
            value: Number(ownedContacts.rows[0]?.count ?? 0),
            hint: "Canonical contacts you are responsible for"
          },
          {
            label: "Outbound today",
            value: Number(outboundToday.rows[0]?.count ?? 0),
            hint: "Messages sent from your assigned threads today"
          }
        ]
      };
    } finally {
      client.release();
    }
  }

  async getAdminDashboard(authUser: AuthUser): Promise<DashboardSummary> {
    if (!authUser.organizationId) {
      throw new Error("organization_id is required");
    }

    const client = await pool.connect();
    try {
      const [contacts, openConversations, messagesToday, activeAccounts] = await Promise.all([
        client.query<{ count: string }>(
          "select count(*)::text as count from contacts where organization_id = $1",
          [authUser.organizationId]
        ),
        client.query<{ count: string }>(
          "select count(*)::text as count from conversations where organization_id = $1 and status = 'open'",
          [authUser.organizationId]
        ),
        client.query<{ count: string }>(
          `
            select count(*)::text as count
            from messages
            where organization_id = $1
              and sent_at >= date_trunc('day', timezone('utc', now()))
          `,
          [authUser.organizationId]
        ),
        client.query<{ count: string }>(
          `
            select count(*)::text as count
            from whatsapp_accounts
            where organization_id = $1
              and connection_status in ('connected', 'reconnecting', 'pairing', 'qr_required')
          `,
          [authUser.organizationId]
        )
      ]);

      return {
        scope: "admin",
        metrics: [
          {
            label: "Total contacts",
            value: Number(contacts.rows[0]?.count ?? 0),
            hint: "Canonical contacts in this organization"
          },
          {
            label: "Open conversations",
            value: Number(openConversations.rows[0]?.count ?? 0),
            hint: "Live WhatsApp threads waiting on action"
          },
          {
            label: "Messages today",
            value: Number(messagesToday.rows[0]?.count ?? 0),
            hint: "Inbound and outbound messages since midnight UTC"
          },
          {
            label: "Active accounts",
            value: Number(activeAccounts.rows[0]?.count ?? 0),
            hint: "WhatsApp accounts with an active or recovering session"
          }
        ]
      };
    } finally {
      client.release();
    }
  }

  async getSuperAdminDashboard(): Promise<DashboardSummary> {
    const client = await pool.connect();
    try {
      const [organizations, activeOrganizations, users, accounts] = await Promise.all([
        client.query<{ count: string }>("select count(*)::text as count from organizations"),
        client.query<{ count: string }>(
          "select count(*)::text as count from organizations where status in ('active', 'trial')"
        ),
        client.query<{ count: string }>("select count(*)::text as count from organization_users where status = 'active'"),
        client.query<{ count: string }>(
          "select count(*)::text as count from whatsapp_accounts where connection_status in ('connected', 'reconnecting', 'pairing', 'qr_required')"
        )
      ]);

      return {
        scope: "super_admin",
        metrics: [
          {
            label: "Organizations",
            value: Number(organizations.rows[0]?.count ?? 0),
            hint: "Total tenants registered on the platform"
          },
          {
            label: "Active tenants",
            value: Number(activeOrganizations.rows[0]?.count ?? 0),
            hint: "Organizations in active or trial status"
          },
          {
            label: "Active users",
            value: Number(users.rows[0]?.count ?? 0),
            hint: "Organization users with active access"
          },
          {
            label: "Healthy accounts",
            value: Number(accounts.rows[0]?.count ?? 0),
            hint: "WhatsApp accounts with a live or recovering session"
          }
        ]
      };
    } finally {
      client.release();
    }
  }
}
