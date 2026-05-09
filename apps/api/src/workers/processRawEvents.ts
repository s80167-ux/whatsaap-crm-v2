import { setTimeout as sleep } from "node:timers/promises";
import { env } from "../config/env.js";
import { RawEventProcessorService } from "../services/rawEventProcessorService.js";
import { logger } from "../config/logger.js";
import { pool } from "../config/database.js";

const processor = new RawEventProcessorService();
const runOnce = process.argv.includes("--once");

async function main() {
  do {
    let totalProcessed = 0;
    let processed = 0;

    do {
      processed = await processor.processPendingBatch(env.RAW_EVENT_WORKER_BATCH_SIZE);
      totalProcessed += processed;
    } while (processed === env.RAW_EVENT_WORKER_BATCH_SIZE);

    if (totalProcessed > 0) {
      logger.info({ processed: totalProcessed }, "Processed pending raw events");
    }

    if (runOnce) {
      break;
    }

    await sleep(env.RAW_EVENT_WORKER_POLL_INTERVAL_MS);
  } while (true);
}

main()
  .catch((error) => {
    logger.error({ error }, "Raw event worker failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
