import { pool } from "./config/database.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { app } from "./app.js";
import { ConnectorCommandService } from "./services/connectorCommandService.js";

async function bootstrap() {
  await pool.query("select 1");
  logger.info("Connector database connection established");

  const connectorCommandService = new ConnectorCommandService();
  await connectorCommandService.initializeAll();

  app.listen(env.PORT, () => {
    logger.info(`WhatsApp connector listening on port ${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  logger.error({ error }, "Failed to start WhatsApp connector");
  process.exit(1);
});
