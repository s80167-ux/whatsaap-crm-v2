import { setTimeout as sleep } from "node:timers/promises";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { pool } from "../config/database.js";
import { MessageDispatchService } from "../services/messageDispatchService.js";

const dispatcher = new MessageDispatchService();
const runOnce = process.argv.includes("--once");

async function main() {
  do {
    const processed = await dispatcher.processPendingBatch(env.MESSAGE_OUTBOX_WORKER_BATCH_SIZE);

    if (processed > 0) {
      logger.info({ processed }, "Processed pending outbound message jobs");
    }

    if (runOnce) {
      break;
    }

    await sleep(env.MESSAGE_OUTBOX_WORKER_POLL_INTERVAL_MS);
  } while (true);
}

main()
  .catch((error) => {
    logger.error({ error }, "Outbound message worker failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
