import type { PoolClient } from "pg";

export interface SalesOrderRow {
  id: string;
  organization_id: string;
  contact_id: string;
  lead_id: string | null;
  assigned_user_id: string | null;
  status: string;
  total_amount: string;
  currency: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  contact_name: string | null;
  primary_phone_normalized: string | null;
  lead_status: string | null;
}

export interface SalesSummaryRow {
  total_orders: number;
  open_orders: number;
  won_orders: number;
  lost_orders: number;
  open_value: string;
  won_value: string;
}

export interface SalesOrderItemRow {
  id: string;
  sales_order_id: string;
  product_type: string | null;
  package_name: string | null;
  unit_price: string;
  quantity: number;
  total_price: string;
  created_at: string;
}

export interface SalesOrderHistoryRow {
  id: string;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  metadata: unknown;
  created_at: string;
}

export class SalesRepository {
  async listOrders(
    client: PoolClient,
    input: {
      organizationId: string;
      assignedOnly: boolean;
      organizationUserId?: string | null;
      status?: string | null;
      createdFrom?: string | null;
      createdTo?: string | null;
      closedFrom?: string | null;
      closedTo?: string | null;
    }
  ): Promise<SalesOrderRow[]> {
    const result = await client.query<SalesOrderRow>(
      `
        select
          so.id,
          so.organization_id,
          so.contact_id,
          so.lead_id,
          so.assigned_user_id,
          so.status,
          so.total_amount::text,
          so.currency,
          so.closed_at,
          so.created_at,
          so.updated_at,
          coalesce(ct.display_name, ct.primary_phone_e164, ct.primary_phone_normalized, 'Unknown') as contact_name,
          ct.primary_phone_normalized,
          ld.status as lead_status
        from sales_orders so
        join contacts ct on ct.id = so.contact_id
        left join leads ld on ld.id = so.lead_id
        where so.organization_id = $1
          and ($4::text is null or so.status = $4)
          and ($5::timestamptz is null or so.created_at >= $5::timestamptz)
          and ($6::timestamptz is null or so.created_at < $6::timestamptz)
          and ($7::timestamptz is null or so.closed_at >= $7::timestamptz)
          and ($8::timestamptz is null or so.closed_at < $8::timestamptz)
          and (
            not $2::boolean
            or so.assigned_user_id = $3
          )
        order by so.updated_at desc, so.created_at desc, so.id desc
      `,
      [
        input.organizationId,
        input.assignedOnly,
        input.organizationUserId ?? null,
        input.status ?? null,
        input.createdFrom ?? null,
        input.createdTo ?? null,
        input.closedFrom ?? null,
        input.closedTo ?? null
      ]
    );

    return result.rows;
  }

  async getSummary(
    client: PoolClient,
    input: {
      organizationId: string;
      assignedOnly: boolean;
      organizationUserId?: string | null;
    }
  ): Promise<SalesSummaryRow> {
    const result = await client.query<SalesSummaryRow>(
      `
        select
          count(*)::integer as total_orders,
          count(*) filter (where so.status = 'open')::integer as open_orders,
          count(*) filter (where so.status = 'closed_won')::integer as won_orders,
          count(*) filter (where so.status = 'closed_lost')::integer as lost_orders,
          coalesce(sum(so.total_amount) filter (where so.status = 'open'), 0)::text as open_value,
          coalesce(sum(so.total_amount) filter (where so.status = 'closed_won'), 0)::text as won_value
        from sales_orders so
        where so.organization_id = $1
          and (
            not $2::boolean
            or so.assigned_user_id = $3
          )
      `,
      [input.organizationId, input.assignedOnly, input.organizationUserId ?? null]
    );

    return (
      result.rows[0] ?? {
        total_orders: 0,
        open_orders: 0,
        won_orders: 0,
        lost_orders: 0,
        open_value: "0",
        won_value: "0"
      }
    );
  }

  async createOrder(
    client: PoolClient,
    input: {
      organizationId: string;
      contactId: string;
      leadId?: string | null;
      assignedUserId?: string | null;
      status: string;
      totalAmount: number;
      currency: string;
      closedAt?: string | null;
    }
  ): Promise<SalesOrderRow> {
    const result = await client.query<SalesOrderRow>(
      `
        insert into sales_orders (
          organization_id,
          contact_id,
          lead_id,
          assigned_user_id,
          status,
          total_amount,
          currency,
          closed_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        returning
          id,
          organization_id,
          contact_id,
          lead_id,
          assigned_user_id,
          status,
          total_amount::text,
          currency,
          closed_at,
          created_at,
          updated_at,
          null::text as contact_name,
          null::text as primary_phone_normalized,
          null::text as lead_status
      `,
      [
        input.organizationId,
        input.contactId,
        input.leadId ?? null,
        input.assignedUserId ?? null,
        input.status,
        input.totalAmount,
        input.currency,
        input.closedAt ?? null
      ]
    );

    return result.rows[0];
  }

  async contactExists(client: PoolClient, organizationId: string, contactId: string): Promise<boolean> {
    const result = await client.query<{ exists: boolean }>(
      `
        select exists (
          select 1
          from contacts
          where organization_id = $1
            and id = $2
        ) as exists
      `,
      [organizationId, contactId]
    );

    return result.rows[0]?.exists ?? false;
  }

  async findOrderById(
    client: PoolClient,
    input: {
      organizationId: string;
      orderId: string;
      assignedOnly: boolean;
      organizationUserId?: string | null;
    }
  ): Promise<SalesOrderRow | null> {
    const result = await client.query<SalesOrderRow>(
      `
        select
          so.id,
          so.organization_id,
          so.contact_id,
          so.lead_id,
          so.assigned_user_id,
          so.status,
          so.total_amount::text,
          so.currency,
          so.closed_at,
          so.created_at,
          so.updated_at,
          coalesce(ct.display_name, ct.primary_phone_e164, ct.primary_phone_normalized, 'Unknown') as contact_name,
          ct.primary_phone_normalized,
          ld.status as lead_status
        from sales_orders so
        join contacts ct on ct.id = so.contact_id
        left join leads ld on ld.id = so.lead_id
        where so.organization_id = $1
          and so.id = $2
          and (
            not $3::boolean
            or so.assigned_user_id = $4
          )
        limit 1
      `,
      [input.organizationId, input.orderId, input.assignedOnly, input.organizationUserId ?? null]
    );

    return result.rows[0] ?? null;
  }

  async listOrderItems(client: PoolClient, orderId: string): Promise<SalesOrderItemRow[]> {
    const result = await client.query<SalesOrderItemRow>(
      `
        select
          id,
          sales_order_id,
          product_type,
          package_name,
          unit_price::text,
          quantity,
          total_price::text,
          created_at
        from sales_order_items
        where sales_order_id = $1
        order by created_at asc, id asc
      `,
      [orderId]
    );

    return result.rows;
  }

  async listOrderHistory(client: PoolClient, input: { orderId: string; limit?: number }): Promise<SalesOrderHistoryRow[]> {
    const result = await client.query<SalesOrderHistoryRow>(
      `
        select
          al.id,
          ou.full_name as actor_name,
          al.actor_role,
          al.action,
          al.metadata,
          al.created_at
        from audit_logs al
        left join organization_users ou on ou.id = al.actor_organization_user_id
        where al.entity_type in ('sales_order', 'sales_order_item')
          and (
            (al.entity_type = 'sales_order' and al.entity_id = $1)
            or (al.entity_type = 'sales_order_item' and al.metadata ->> 'sales_order_id' = $1)
          )
        order by al.created_at desc, al.id desc
        limit $2
      `,
      [input.orderId, input.limit ?? 50]
    );

    return result.rows;
  }

  async addOrderItem(
    client: PoolClient,
    input: {
      salesOrderId: string;
      productType?: string | null;
      packageName?: string | null;
      unitPrice: number;
      quantity: number;
      totalPrice: number;
    }
  ): Promise<SalesOrderItemRow> {
    const result = await client.query<SalesOrderItemRow>(
      `
        insert into sales_order_items (
          sales_order_id,
          product_type,
          package_name,
          unit_price,
          quantity,
          total_price
        )
        values ($1, $2, $3, $4, $5, $6)
        returning
          id,
          sales_order_id,
          product_type,
          package_name,
          unit_price::text,
          quantity,
          total_price::text,
          created_at
      `,
      [
        input.salesOrderId,
        input.productType ?? null,
        input.packageName ?? null,
        input.unitPrice,
        input.quantity,
        input.totalPrice
      ]
    );

    return result.rows[0];
  }

  async recalculateOrderTotal(client: PoolClient, orderId: string): Promise<void> {
    await client.query(
      `
        update sales_orders so
        set total_amount = coalesce((
              select sum(soi.total_price)
              from sales_order_items soi
              where soi.sales_order_id = so.id
            ), 0),
            updated_at = timezone('utc', now())
        where so.id = $1
      `,
      [orderId]
    );
  }

  async updateOrder(
    client: PoolClient,
    input: {
      orderId: string;
      assignedUserId?: string | null;
      status?: string;
      totalAmount?: number;
      currency?: string;
      closedAt?: string | null;
    }
  ): Promise<void> {
    await client.query(
      `
        update sales_orders
        set assigned_user_id = coalesce($2, assigned_user_id),
            status = coalesce($3, status),
            total_amount = coalesce($4, total_amount),
            currency = coalesce($5, currency),
            closed_at = case
              when $6::timestamptz is not null then $6::timestamptz
              when $3::text = 'open' then null
              else closed_at
            end,
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [
        input.orderId,
        input.assignedUserId ?? null,
        input.status ?? null,
        input.totalAmount ?? null,
        input.currency ?? null,
        input.closedAt ?? null
      ]
    );
  }
}
