import { pool } from "../config/database.js";
import { logger } from "../config/logger.js";
import { UsageAggregationService } from "../services/usageAggregationService.js";

function readArg(name: string) {
  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const service = new UsageAggregationService();
  const dateArg = readArg("date");
  const daysArg = Number(readArg("days") ?? "0");

  if (dateArg) {
    const usageDate = new Date(dateArg);
    usageDate.setUTCHours(0, 0, 0, 0);
    const upserted = await service.aggregateDay(usageDate);
    logger.info({ usageDate: usageDate.toISOString(), upserted }, "Usage aggregation completed for one day");
    return;
  }

  const days = daysArg > 0 ? daysArg : 7;
  const aggregated = await service.aggregateRecentDays(days);
  logger.info({ days: aggregated }, "Usage aggregation completed for recent days");
}

main()
  .catch((error) => {
    logger.error({ error }, "Usage aggregation worker failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
