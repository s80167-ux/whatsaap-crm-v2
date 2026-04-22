import type { PoolClient } from "pg";

export interface AuditLogRecord {
  id: string;
  organization_id: string | null;
  actor_auth_user_id: string | null;
  actor_organization_user_id: string | null;
  actor_name?: string | null;
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
      entityType?: string | null;
      entityId?: string | null;
      actionPrefix?: string | null;
      limit?: number;
    }
  ): Promise<AuditLogRecord[]> {
    const conditions = ["1 = 1"];
    const values: Array<string | number> = [];

    if (input?.organizationId) {
      values.push(input.organizationId);
      conditions.push(`organization_id = $${values.length}`);
    }

    if (input?.entityType) {
      values.push(input.entityType);
      conditions.push(`entity_type = $${values.length}`);
    }

    if (input?.entityId) {
      values.push(input.entityId);
      conditions.push(`entity_id = $${values.length}`);
    }

    if (input?.actionPrefix) {
      values.push(`${input.actionPrefix}%`);
      conditions.push(`action like $${values.length}`);
    }

    values.push(input?.limit ?? 100);

    const result = await client.query<AuditLogRecord>(
      `
        select
          al.*,
          ou.full_name as actor_name
        from audit_logs al
        left join organization_users ou on ou.id = al.actor_organization_user_id
        where ${conditions.map((condition) => condition.replaceAll("organization_id", "al.organization_id").replaceAll("entity_type", "al.entity_type").replaceAll("entity_id", "al.entity_id").replaceAll("action", "al.action")).join(" and ")}
        order by al.created_at desc, al.id desc
        limit $${values.length}
      `,
      values
    );

    return result.rows;
  }
}
