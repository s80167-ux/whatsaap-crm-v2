import type { PoolClient } from "pg";

export class ContactRecoveryAuditService {
  async record(
    client: PoolClient,
    input: {
      organizationId: string;
      whatsappAccountId: string;
      contactId?: string | null;
      action: string;
      source: string;
      confidenceScore?: number | null;
      beforeData?: unknown;
      afterData?: unknown;
      reason?: string | null;
      rawPayload?: unknown;
    }
  ) {
    await client.query(
      `
        insert into wa_contact_recovery_audit_logs (
          organization_id,
          whatsapp_account_id,
          contact_id,
          action,
          source,
          confidence_score,
          before_data,
          after_data,
          reason,
          raw_payload
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        input.organizationId,
        input.whatsappAccountId,
        input.contactId ?? null,
        input.action,
        input.source,
        input.confidenceScore ?? null,
        JSON.stringify(input.beforeData ?? null),
        JSON.stringify(input.afterData ?? null),
        input.reason ?? null,
        JSON.stringify(input.rawPayload ?? null)
      ]
    );
  }

  async listRecent(client: PoolClient, input: { organizationId: string; whatsappAccountId: string; limit?: number }) {
    const result = await client.query(
      `
        select *
        from wa_contact_recovery_audit_logs
        where organization_id = $1
          and whatsapp_account_id = $2
        order by created_at desc
        limit $3
      `,
      [input.organizationId, input.whatsappAccountId, input.limit ?? 100]
    );

    return result.rows;
  }
}
