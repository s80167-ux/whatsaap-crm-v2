import { setTimeout as sleep } from "node:timers/promises";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { pool } from "../config/database.js";
import { SupabaseUsageMonitorService } from "../services/supabaseUsageMonitorService.js";

const runOnce = process.argv.includes("--once");
const advisoryLockId = 90214061;
const service = new SupabaseUsageMonitorService();

async function main() {
  if (!runOnce && !env.SUPABASE_USAGE_WORKER_ENABLED) {
    logger.info("Supabase usage worker is disabled by env; exiting");
    return;
  }

  let consecutiveFailures = 0;

  do {
    try {
      const locked = await tryAcquireLock();

      if (!locked) {
        logger.info("Supabase usage worker lock is already held; skipping this cycle");
      } else {
        try {
          const snapshot = await service.collectSnapshot();
          logger.info(
            {
              snapshotId: snapshot.id,
              collectedAt: snapshot.collected_at,
              sourceStatus: snapshot.source_status,
              overallStatus: snapshot.overall_status
            },
            "Collected Supabase usage snapshot"
          );
        } finally {
          await releaseLock();
        }
      }

      consecutiveFailures = 0;

      if (runOnce) {
        break;
      }
    } catch (error) {
      logger.error({ err: error }, "Supabase usage worker iteration failed");

      if (runOnce) {
        throw error;
      }

      consecutiveFailures += 1;
    }

    await sleep(getDelayMs(consecutiveFailures, env.SUPABASE_USAGE_WORKER_POLL_INTERVAL_MS));
  } while (true);
}

function getDelayMs(consecutiveFailures: number, baseDelayMs: number) {
  if (consecutiveFailures === 0) {
    return baseDelayMs;
  }

  return Math.min(baseDelayMs * 2 ** Math.min(consecutiveFailures, 5), 60_000);
}

async function tryAcquireLock() {
  const result = await pool.query<{ locked: boolean }>(
    "select pg_try_advisory_lock($1) as locked",
    [advisoryLockId]
  );

  return result.rows[0]?.locked === true;
}

async function releaseLock() {
  try {
    await pool.query("select pg_advisory_unlock($1)", [advisoryLockId]);
  } catch (error) {
    logger.warn({ err: error }, "Failed to release Supabase usage worker advisory lock");
  }
}

main()
  .catch((error) => {
    logger.error({ err: error }, "Supabase usage worker failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
