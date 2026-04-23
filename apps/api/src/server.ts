import { pool } from "./config/database.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { app } from "./app.js";

async function bootstrap() {
  await pool.query("select 1");
  await pool.query("alter table organization_users add column if not exists avatar_url text");
  logger.info("Database connection established");

  app.listen(env.PORT, () => {
    logger.info(`Backend listening on port ${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  logger.error({ error }, "Failed to start backend");
  process.exit(1);
});
