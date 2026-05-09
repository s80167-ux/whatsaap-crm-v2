import { setTimeout as sleep } from "node:timers/promises";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { pool } from "../config/database.js";
import { CampaignDispatchService } from "../services/campaignDispatchService.js";

const dispatcher = new CampaignDispatchService();
const runOnce = process.argv.includes("--once");

async function main() {
  do {
    const processed = await dispatcher.processPendingBatch(env.CAMPAIGN_DISPATCH_WORKER_BATCH_SIZE);

    if (processed > 0) {
      logger.info({ processed }, "Processed pending campaign dispatch jobs");
    }

    if (runOnce) {
      break;
    }

    await sleep(env.CAMPAIGN_DISPATCH_WORKER_POLL_INTERVAL_MS);
  } while (true);
}

main()
  .catch((error) => {
    logger.error({ error }, "Campaign dispatch worker failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
