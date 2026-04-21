import type { PoolClient } from "pg";

export interface AuditLogRecord {
  id: string;
  organization_id: string | null;
  actor_auth_user_id: string | null;
  actor_organization_user_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  request_ip: string | null;
  request_user_agent: string | null;
  metadata: unknown;
  created_at: string;
}

export class AuditLogRepository {
  async create(
    client: PoolClient,
    input: {
      organizationId?: string | null;
      actorAuthUserId?: string | null;
      actorOrganizationUserId?: string | null;
      actorRole?: string | null;
      action: string;
      entityType: string;
      entityId?: string | null;
      requestIp?: string | null;
      requestUserAgent?: string | null;
      metadata?: unknown;
    }
  ): Promise<void> {
    await client.query(
      `
        insert into audit_logs (
          organization_id,
          actor_auth_user_id,
          actor_organization_user_id,
          actor_role,
          action,
          entity_type,
          entity_id,
          request_ip,
          request_user_agent,
          metadata
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        input.organizationId ?? null,
        input.actorAuthUserId ?? null,
        input.actorOrganizationUserId ?? null,
        input.actorRole ?? null,
        input.action,
        input.entityType,
        input.entityId ?? null,
        input.requestIp ?? null,
        input.requestUserAgent ?? null,
        input.metadata ?? null
      ]
    );
  }

  async list(
    client: PoolClient,
    input?: {
      organizationId?: string | null;
      limit?: number;
    }
  ): Promise<AuditLogRecord[]> {
    const conditions = ["1 = 1"];
    const values: Array<string | number> = [];

    if (input?.organizationId) {
      values.push(input.organizationId);
      conditions.push(`organization_id = $${values.length}`);
    }

    values.push(input?.limit ?? 100);

    const result = await client.query<AuditLogRecord>(
      `
        select *
        from audit_logs
        where ${conditions.join(" and ")}
        order by created_at desc, id desc
        limit $${values.length}
      `,
      values
    );

    return result.rows;
  }
}
