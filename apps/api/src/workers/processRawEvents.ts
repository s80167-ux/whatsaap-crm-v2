import { setTimeout as sleep } from "node:timers/promises";
import { env } from "../config/env.js";
import { RawEventProcessorService } from "../services/rawEventProcessorService.js";
import { logger } from "../config/logger.js";
import { pool } from "../config/database.js";

const processor = new RawEventProcessorService();
const runOnce = process.argv.includes("--once");

async function main() {
  let consecutiveFailures = 0;

  do {
    try {
      let totalProcessed = 0;
      let processed = 0;

      do {
        processed = await processor.processPendingBatch(env.RAW_EVENT_WORKER_BATCH_SIZE);
        totalProcessed += processed;
      } while (processed === env.RAW_EVENT_WORKER_BATCH_SIZE);

      consecutiveFailures = 0;

      if (totalProcessed > 0) {
        logger.info({ processed: totalProcessed }, "Processed pending raw events");
      }

      if (runOnce) {
        break;
      }
    } catch (error) {
      logger.error({ err: error }, "Raw event worker iteration failed");

      if (runOnce) {
        throw error;
      }

      consecutiveFailures += 1;
    }

    await sleep(getDelayMs(consecutiveFailures, env.RAW_EVENT_WORKER_POLL_INTERVAL_MS));
  } while (true);
}

function getDelayMs(consecutiveFailures: number, baseDelayMs: number) {
  if (consecutiveFailures === 0) {
    return baseDelayMs;
  }

  return Math.min(baseDelayMs * 2 ** Math.min(consecutiveFailures, 5), 60000);
}

main()
  .catch((error) => {
    logger.error({ error }, "Raw event worker failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
