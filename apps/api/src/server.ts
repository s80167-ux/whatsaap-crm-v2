import { setTimeout as sleep } from "node:timers/promises";
import { pool } from "./config/database.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { app } from "./app.js";
import { RawEventProcessorService } from "./services/rawEventProcessorService.js";

function startEmbeddedRawEventWorker() {
  const processor = new RawEventProcessorService();

  const run = async () => {
    while (true) {
      try {
        let totalProcessed = 0;
        let processed = 0;

        do {
          processed = await processor.processPendingBatch(env.RAW_EVENT_WORKER_BATCH_SIZE);
          totalProcessed += processed;
        } while (processed === env.RAW_EVENT_WORKER_BATCH_SIZE);

        if (totalProcessed > 0) {
          logger.info({ processed: totalProcessed }, "Processed pending raw events from API server");
        }
      } catch (error) {
        logger.error({ error }, "Embedded raw event worker iteration failed");
      }

      await sleep(env.RAW_EVENT_WORKER_POLL_INTERVAL_MS);
    }
  };

  void run();
}

async function bootstrap() {
  await pool.query("select 1");
  await pool.query("alter table organization_users add column if not exists avatar_url text");
  logger.info("Database connection established");

  if (env.EMBED_RAW_EVENT_WORKER) {
    startEmbeddedRawEventWorker();
    logger.info("Embedded raw event worker started");
  }

  app.listen(env.PORT, () => {
    logger.info(`Backend listening on port ${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  logger.error({ err: error }, "Failed to start backend");
  process.exit(1);
});
