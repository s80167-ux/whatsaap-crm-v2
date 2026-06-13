import { setTimeout as sleep } from "node:timers/promises";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { pool } from "../config/database.js";
import { MessageDispatchService } from "../services/messageDispatchService.js";
import { CampaignQueuedRecipientReconciler } from "../services/campaignQueuedRecipientReconciler.js";
import { WhatsAppNumberWarmerService } from "../services/whatsAppNumberWarmerService.js";

const dispatcher = new MessageDispatchService();
const campaignQueuedReconciler = new CampaignQueuedRecipientReconciler();
const whatsAppNumberWarmerService = new WhatsAppNumberWarmerService();
const runOnce = process.argv.includes("--once");

async function main() {
  let consecutiveFailures = 0;

  do {
    try {
      const warmed = await whatsAppNumberWarmerService.processDueWarmers(Math.max(1, Math.floor(env.MESSAGE_OUTBOX_WORKER_BATCH_SIZE / 2)));
      const processed = await dispatcher.processPendingBatch(env.MESSAGE_OUTBOX_WORKER_BATCH_SIZE);
      const reconciled = await campaignQueuedReconciler.reconcile(env.MESSAGE_OUTBOX_WORKER_BATCH_SIZE);
      const changed = reconciled.sentCount + reconciled.failedCount + reconciled.repairedCount;
      consecutiveFailures = 0;

      if (warmed > 0) {
        logger.info({ warmed }, "Queued WhatsApp warmer messages");
      }

      if (processed > 0) {
        logger.info({ processed }, "Processed pending outbound message jobs");
      }

      if (changed > 0) {
        logger.info({ reconciled }, "Reconciled queued campaign recipient statuses");
      }

      if (runOnce) {
        break;
      }
    } catch (err) {
      logger.error({ err }, "Outbound message worker iteration failed");

      if (runOnce) {
        throw err;
      }

      consecutiveFailures += 1;
    }

    await sleep(getDelayMs(consecutiveFailures, env.MESSAGE_OUTBOX_WORKER_POLL_INTERVAL_MS));
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
    logger.error({ err }, "Outbound message worker failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
