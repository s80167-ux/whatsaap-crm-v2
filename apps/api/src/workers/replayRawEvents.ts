import { pool, withTransaction } from "../config/database.js";
import { logger } from "../config/logger.js";
import { RawEventRepository } from "../repositories/rawEventRepository.js";
import { RawEventProcessorService } from "../services/rawEventProcessorService.js";

function readArg(name: string) {
  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readStatuses() {
  const raw = readArg("statuses");
  return raw ? raw.split(",").map((status) => status.trim()).filter(Boolean) : ["failed"];
}

async function main() {
  const organizationId = readArg("organizationId");
  const whatsappAccountId = readArg("whatsappAccountId");
  const limit = Number(readArg("limit") ?? "100");
  const statuses = readStatuses() as Array<"failed" | "ignored" | "pending" | "processing" | "processed">;

  const repository = new RawEventRepository();
  const processor = new RawEventProcessorService();

  const eventIds = await withTransaction(async (client) => {
    const candidates = await repository.list(client, {
      organizationId: organizationId ?? null,
      whatsappAccountId: whatsappAccountId ?? null,
      statuses,
      limit
    });

    return candidates.map((event) => event.id);
  });

  const replayed = await withTransaction((client) => repository.requeueByIds(client, eventIds));

  let processed = 0;

  for (const eventId of eventIds) {
    const didProcess = await processor.processEventById(eventId);
    processed += didProcess ? 1 : 0;
  }

  logger.info(
    {
      organizationId: organizationId ?? null,
      whatsappAccountId: whatsappAccountId ?? null,
      statuses,
      replayed,
      processed
    },
    "Raw event replay completed"
  );
}

main()
  .catch((error) => {
    logger.error({ error }, "Raw event replay failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
