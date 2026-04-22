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

export class LeadRepository {
  async list(
    client: PoolClient,
    input: {
      organizationId: string;
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
        where l.organization_id = $1
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
      organizationId: string;
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
        where l.organization_id = $1
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
}
