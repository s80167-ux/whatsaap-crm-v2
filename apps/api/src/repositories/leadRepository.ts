import type { PoolClient } from "pg";

export interface LeadRow {
  id: string;
  organization_id: string;
  contact_id: string;
  source: string | null;
  status: string;
  temperature: string | null;
  assigned_user_id: string | null;
  created_at: string;
  updated_at: string;
  contact_name: string | null;
  primary_phone_normalized: string | null;
}

export interface LeadHistoryRow {
  id: string;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  metadata: unknown;
  created_at: string;
}

export class LeadRepository {
  async list(
    client: PoolClient,
    input: {
      organizationId?: string | null;
      assignedOnly: boolean;
      organizationUserId?: string | null;
    }
  ): Promise<LeadRow[]> {
    const result = await client.query<LeadRow>(
      `
        select
          l.id,
          l.organization_id,
          l.contact_id,
          l.source,
          l.status,
          l.temperature,
          l.assigned_user_id,
          l.created_at,
          l.updated_at,
          coalesce(ct.display_name, ct.primary_phone_e164, ct.primary_phone_normalized, 'Unknown') as contact_name,
          ct.primary_phone_normalized
        from leads l
        join contacts ct on ct.id = l.contact_id
        where ($1::uuid is null or l.organization_id = $1)
          and (
            not $2::boolean
            or l.assigned_user_id = $3
          )
        order by l.updated_at desc, l.created_at desc, l.id desc
      `,
      [input.organizationId, input.assignedOnly, input.organizationUserId ?? null]
    );

    return result.rows;
  }

  async create(
    client: PoolClient,
    input: {
      organizationId: string;
      contactId: string;
      source?: string | null;
      status: string;
      temperature?: string | null;
      assignedUserId?: string | null;
    }
  ): Promise<LeadRow> {
    const result = await client.query<LeadRow>(
      `
        insert into leads (
          organization_id,
          contact_id,
          source,
          status,
          temperature,
          assigned_user_id
        )
        values ($1, $2, $3, $4, $5, $6)
        returning
          id,
          organization_id,
          contact_id,
          source,
          status,
          temperature,
          assigned_user_id,
          created_at,
          updated_at,
          null::text as contact_name,
          null::text as primary_phone_normalized
      `,
      [
        input.organizationId,
        input.contactId,
        input.source ?? null,
        input.status,
        input.temperature ?? null,
        input.assignedUserId ?? null
      ]
    );

    return result.rows[0];
  }

  async findById(
    client: PoolClient,
    input: {
      organizationId?: string | null;
      leadId: string;
      assignedOnly: boolean;
      organizationUserId?: string | null;
    }
  ): Promise<LeadRow | null> {
    const result = await client.query<LeadRow>(
      `
        select
          l.id,
          l.organization_id,
          l.contact_id,
          l.source,
          l.status,
          l.temperature,
          l.assigned_user_id,
          l.created_at,
          l.updated_at,
          coalesce(ct.display_name, ct.primary_phone_e164, ct.primary_phone_normalized, 'Unknown') as contact_name,
          ct.primary_phone_normalized
        from leads l
        join contacts ct on ct.id = l.contact_id
        where ($1::uuid is null or l.organization_id = $1)
          and l.id = $2
          and (
            not $3::boolean
            or l.assigned_user_id = $4
          )
        limit 1
      `,
      [input.organizationId, input.leadId, input.assignedOnly, input.organizationUserId ?? null]
    );

    return result.rows[0] ?? null;
  }

  async updateStatus(
    client: PoolClient,
    input: {
      leadId: string;
      status: string;
    }
  ): Promise<void> {
    await client.query(
      `
        update leads
        set status = $2,
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [input.leadId, input.status]
    );
  }

  async update(
    client: PoolClient,
    input: {
      leadId: string;
      source?: string | null;
      status?: string;
      temperature?: string | null;
      assignedUserId?: string | null;
    }
  ): Promise<void> {
    await client.query(
      `
        update leads
        set source = case
              when $2::boolean then $3
              else source
            end,
            status = case
              when $4::boolean then $5
              else status
            end,
            temperature = case
              when $6::boolean then $7
              else temperature
            end,
            assigned_user_id = case
              when $8::boolean then $9
              else assigned_user_id
            end,
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [
        input.leadId,
        input.source !== undefined,
        input.source ?? null,
        input.status !== undefined,
        input.status ?? null,
        input.temperature !== undefined,
        input.temperature ?? null,
        input.assignedUserId !== undefined,
        input.assignedUserId ?? null
      ]
    );
  }

  async listHistory(client: PoolClient, input: { leadId: string; limit?: number }): Promise<LeadHistoryRow[]> {
    const result = await client.query<LeadHistoryRow>(
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
        where al.entity_type = 'lead'
          and al.entity_id = $1
        order by al.created_at desc, al.id desc
        limit $2
      `,
      [input.leadId, input.limit ?? 50]
    );

    return result.rows;
  }
}
