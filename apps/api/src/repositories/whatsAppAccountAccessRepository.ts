import type { PoolClient } from "pg";

export type WhatsAppAccountAccessRole = "owner" | "manager" | "agent" | "viewer";

export interface WhatsAppAccountAccessRow {
  id: string;
  organization_id: string;
  whatsapp_account_id: string;
  organization_user_id: string;
  access_role: WhatsAppAccountAccessRole;
  can_view: boolean;
  can_reply: boolean;
  can_create_sales: boolean;
  can_edit_sales: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user_email: string | null;
  user_full_name: string | null;
  user_role: string | null;
  user_status: string | null;
}

export interface WhatsAppAccountAccessSummaryRow {
  id: string;
  organization_id: string;
  created_by: string | null;
  label: string | null;
  account_phone_e164: string | null;
  account_phone_normalized: string | null;
  connection_status: string;
  display_name: string | null;
  owner_name: string | null;
  access_count: number;
}

export type WhatsAppAccountAccessInput = {
  organizationUserId: string;
  accessRole: WhatsAppAccountAccessRole;
  canView: boolean;
  canReply: boolean;
  canCreateSales: boolean;
  canEditSales: boolean;
  isActive: boolean;
};

export class WhatsAppAccountAccessRepository {
  async hasPermission(
    client: PoolClient,
    input: {
      organizationId: string;
      whatsappAccountId: string;
      organizationUserId: string;
      permission: "can_view" | "can_reply" | "can_create_sales" | "can_edit_sales";
    }
  ) {
    const result = await client.query<{ allowed: boolean }>(
      `
        select exists (
          select 1
          from whatsapp_account_user_access wau
          where wau.organization_id = $1
            and wau.whatsapp_account_id = $2
            and wau.organization_user_id = $3
            and wau.is_active = true
            and wau.${input.permission} = true
        ) as allowed
      `,
      [input.organizationId, input.whatsappAccountId, input.organizationUserId]
    );

    return result.rows[0]?.allowed ?? false;
  }

  async canCreateSalesForContact(
    client: PoolClient,
    input: {
      organizationId: string;
      contactId: string;
      organizationUserId: string;
    }
  ) {
    const result = await client.query<{ allowed: boolean }>(
      `
        select exists (
          select 1
          from whatsapp_account_user_access wau
          where wau.organization_id = $1
            and wau.organization_user_id = $3
            and wau.is_active = true
            and wau.can_create_sales = true
            and (
              exists (
                select 1
                from conversations c
                where c.organization_id = $1
                  and c.contact_id = $2
                  and c.whatsapp_account_id = wau.whatsapp_account_id
              )
              or exists (
                select 1
                from contact_identities ci
                where ci.organization_id = $1
                  and ci.contact_id = $2
                  and ci.whatsapp_account_id = wau.whatsapp_account_id
                  and ci.deleted_at is null
              )
              or exists (
                select 1
                from messages m
                where m.organization_id = $1
                  and m.contact_id = $2
                  and m.whatsapp_account_id = wau.whatsapp_account_id
              )
            )
        ) as allowed
      `,
      [input.organizationId, input.contactId, input.organizationUserId]
    );

    return result.rows[0]?.allowed ?? false;
  }

  async listAccountSummaries(client: PoolClient, organizationId: string): Promise<WhatsAppAccountAccessSummaryRow[]> {
    const result = await client.query<WhatsAppAccountAccessSummaryRow>(
      `
        select
          wa.id,
          wa.organization_id,
          wa.created_by,
          wa.label,
          wa.account_phone_e164,
          wa.account_phone_normalized,
          wa.connection_status,
          wa.display_name,
          owner.full_name as owner_name,
          count(wau.id) filter (where wau.is_active = true and wau.can_view = true)::integer as access_count
        from whatsapp_accounts wa
        left join organization_users owner on owner.id = wa.created_by
        left join whatsapp_account_user_access wau on wau.whatsapp_account_id = wa.id
        where wa.organization_id = $1
        group by wa.id, owner.full_name
        order by wa.created_at desc, wa.id desc
      `,
      [organizationId]
    );

    return result.rows;
  }

  async listAccessForAccount(
    client: PoolClient,
    input: {
      organizationId: string;
      whatsappAccountId: string;
    }
  ): Promise<WhatsAppAccountAccessRow[]> {
    const result = await client.query<WhatsAppAccountAccessRow>(
      `
        select
          wau.id,
          wau.organization_id,
          wau.whatsapp_account_id,
          wau.organization_user_id,
          wau.access_role,
          wau.can_view,
          wau.can_reply,
          wau.can_create_sales,
          wau.can_edit_sales,
          wau.is_active,
          wau.created_at,
          wau.updated_at,
          ou.email as user_email,
          ou.full_name as user_full_name,
          ou.role as user_role,
          ou.status as user_status
        from whatsapp_account_user_access wau
        join organization_users ou on ou.id = wau.organization_user_id
        where wau.organization_id = $1
          and wau.whatsapp_account_id = $2
        order by
          case wau.access_role
            when 'owner' then 0
            when 'manager' then 1
            when 'agent' then 2
            else 3
          end,
          coalesce(ou.full_name, ou.email, ou.id) asc
      `,
      [input.organizationId, input.whatsappAccountId]
    );

    return result.rows;
  }

  async replaceAccessForAccount(
    client: PoolClient,
    input: {
      organizationId: string;
      whatsappAccountId: string;
      accessList: WhatsAppAccountAccessInput[];
    }
  ) {
    const userIds = input.accessList.map((access) => access.organizationUserId);
    const activeOwnerCount = input.accessList.filter((access) => access.isActive && access.accessRole === "owner").length;

    if (activeOwnerCount < 1) {
      throw new Error("At least one active owner is required");
    }

    const usersResult = await client.query<{ count: number }>(
      `
        select count(*)::integer as count
        from organization_users
        where organization_id = $1
          and id = any($2::uuid[])
          and status <> 'disabled'
      `,
      [input.organizationId, userIds]
    );

    if ((usersResult.rows[0]?.count ?? 0) !== userIds.length) {
      throw new Error("All users must belong to the same organization");
    }

    await client.query(
      `
        delete from whatsapp_account_user_access
        where organization_id = $1
          and whatsapp_account_id = $2
          and not (organization_user_id = any($3::uuid[]))
      `,
      [input.organizationId, input.whatsappAccountId, userIds]
    );

    for (const access of input.accessList) {
      await client.query(
        `
          insert into whatsapp_account_user_access (
            organization_id,
            whatsapp_account_id,
            organization_user_id,
            access_role,
            can_view,
            can_reply,
            can_create_sales,
            can_edit_sales,
            is_active,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, timezone('utc', now()))
          on conflict (whatsapp_account_id, organization_user_id)
          do update set
            organization_id = excluded.organization_id,
            access_role = excluded.access_role,
            can_view = excluded.can_view,
            can_reply = excluded.can_reply,
            can_create_sales = excluded.can_create_sales,
            can_edit_sales = excluded.can_edit_sales,
            is_active = excluded.is_active,
            updated_at = timezone('utc', now())
        `,
        [
          input.organizationId,
          input.whatsappAccountId,
          access.organizationUserId,
          access.accessRole,
          access.canView,
          access.canReply,
          access.canCreateSales,
          access.canEditSales,
          access.isActive
        ]
      );
    }
  }
}
