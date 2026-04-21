import { pool, withTransaction } from "../config/database.js";
import { AuditLogRepository } from "../repositories/auditLogRepository.js";
import type { AuthUser } from "../types/auth.js";

export type AuditRequestContext = {
  ip?: string | null;
  userAgent?: string | null;
};

export class AuditLogService {
  constructor(private readonly repository = new AuditLogRepository()) {}

  async record(
    authUser: AuthUser | null,
    input: {
      organizationId?: string | null;
      action: string;
      entityType: string;
      entityId?: string | null;
      metadata?: unknown;
      request?: AuditRequestContext | null;
    }
  ) {
    return withTransaction((client) =>
      this.repository.create(client, {
        organizationId: input.organizationId ?? authUser?.organizationId ?? null,
        actorAuthUserId: authUser?.authUserId ?? null,
        actorOrganizationUserId: authUser?.organizationUserId ?? null,
        actorRole: authUser?.role ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        requestIp: input.request?.ip ?? null,
        requestUserAgent: input.request?.userAgent ?? null,
        metadata: input.metadata ?? null
      })
    );
  }

  async list(input?: { organizationId?: string | null; limit?: number }) {
    const client = await pool.connect();
    try {
      return this.repository.list(client, input);
    } finally {
      client.release();
    }
  }
}
