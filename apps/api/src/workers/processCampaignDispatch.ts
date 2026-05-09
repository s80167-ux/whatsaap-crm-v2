import { setTimeout as sleep } from "node:timers/promises";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { pool } from "../config/database.js";
import { CampaignDispatchService } from "../services/campaignDispatchService.js";

const dispatcher = new CampaignDispatchService();
const runOnce = process.argv.includes("--once");

async function main() {
  let consecutiveFailures = 0;

  do {
    try {
      const processed = await dispatcher.processPendingBatch(env.CAMPAIGN_DISPATCH_WORKER_BATCH_SIZE);
      consecutiveFailures = 0;

      if (processed > 0) {
        logger.info({ processed }, "Processed pending campaign dispatch jobs");
      }

      if (runOnce) {
        break;
      }
    } catch (err) {
      logger.error({ err }, "Campaign dispatch worker iteration failed");

      if (runOnce) {
        throw err;
      }

      consecutiveFailures += 1;
    }

    await sleep(getDelayMs(consecutiveFailures, env.CAMPAIGN_DISPATCH_WORKER_POLL_INTERVAL_MS));
  } while (true);
}

function getDelayMs(consecutiveFailures: number, baseDelayMs: number) {
  if (consecutiveFailures === 0) {
    return baseDelayMs;
  }

  return Math.min(baseDelayMs * 2 ** Math.min(consecutiveFailures, 5), 60000);
}

main()
  .catch((err) => {
    logger.error({ err }, "Campaign dispatch worker failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
