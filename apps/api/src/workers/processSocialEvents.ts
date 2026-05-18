import { setTimeout as sleep } from "node:timers/promises";
import { pool } from "../config/database.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { SocialMessageIngestionService } from "../services/socialMessageIngestionService.js";

const runOnce = process.argv.includes("--once");
const service = new SocialMessageIngestionService();

async function runIteration() {
  const result = await service.processPendingBatch(env.SOCIAL_EVENT_WORKER_BATCH_SIZE);
  const total = result.processed + result.ignored + result.failed;

  if (total > 0) {
    logger.info(result, "Processed pending social raw events");
  }
}

async function main() {
  await pool.query("select 1");

  if (runOnce) {
    await runIteration();
    await pool.end();
    return;
  }

  while (true) {
    try {
      await runIteration();
    } catch (error) {
      logger.error({ err: error }, "Social event worker iteration failed");
    }

    await sleep(env.SOCIAL_EVENT_WORKER_POLL_INTERVAL_MS);
  }
}

main().catch((error) => {
  logger.error({ err: error }, "Social event worker failed");
  process.exit(1);
});
