import { pool } from "./config/database.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { app } from "./app.js";

async function bootstrap() {
  console.log("[startup] bootstrap begin");
  await pool.query("select 1");
  console.log("[startup] database select 1 complete");
  await pool.query("alter table organization_users add column if not exists avatar_url text");
  console.log("[startup] organization_users migration check complete");
  logger.info("Database connection established");

  app.listen(env.PORT, () => {
    console.log(`[startup] app.listen callback on port ${env.PORT}`);
    logger.info(`Backend listening on port ${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("[startup] bootstrap failed", error);
  logger.error({ err: error }, "Failed to start backend");
  process.exit(1);
});
