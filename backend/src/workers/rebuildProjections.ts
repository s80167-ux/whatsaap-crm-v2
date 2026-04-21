import { pool, withTransaction } from "../config/database.js";
import { logger } from "../config/logger.js";
import { ProjectionService } from "../services/projectionService.js";

const projectionService = new ProjectionService();

async function main() {
  const client = await pool.connect();

  try {
    const conversationIds = (
      await client.query<{ id: string }>("select id from conversations order by created_at asc")
    ).rows.map((row) => row.id);

    const contactIds = (await client.query<{ id: string }>("select id from contacts order by created_at asc")).rows.map(
      (row) => row.id
    );

    const organizationDays = (
      await client.query<{ organization_id: string; metric_date: string }>(
        `
          select organization_id, date_trunc('day', sent_at)::date::text as metric_date
          from messages
          where sent_at is not null
          group by organization_id, date_trunc('day', sent_at)::date
          order by metric_date asc
        `
      )
    ).rows;

    for (const conversationId of conversationIds) {
      await withTransaction((transactionClient) => projectionService.refreshConversation(transactionClient, conversationId));
    }

    for (const contactId of contactIds) {
      await withTransaction((transactionClient) => projectionService.refreshContact(transactionClient, contactId));
    }

    for (const row of organizationDays) {
      await withTransaction((transactionClient) =>
        projectionService.refreshDashboardMetric(transactionClient, row.organization_id, new Date(row.metric_date))
      );
    }

    logger.info(
      {
        conversations: conversationIds.length,
        contacts: contactIds.length,
        organizationDays: organizationDays.length
      },
      "Projection rebuild completed"
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  logger.error({ error }, "Projection rebuild failed");
  process.exitCode = 1;
});
