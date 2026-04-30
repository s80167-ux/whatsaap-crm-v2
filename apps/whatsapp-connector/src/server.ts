import path from "node:path";
import { pool } from "./config/database.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { app } from "./app.js";
import { ConnectorCommandService } from "./services/connectorCommandService.js";

function logDeploymentWarnings() {
  if (env.NODE_ENV !== "production") {
    return;
  }

  if (!path.isAbsolute(env.BAILEYS_AUTH_DIR)) {
    logger.warn(
      { baileysAuthDir: env.BAILEYS_AUTH_DIR },
      "BAILEYS_AUTH_DIR is not absolute in production; auth state may be lost on container restart"
    );
  }

  if (env.BAILEYS_AUTH_DIR === "./data/baileys_auth") {
    logger.warn(
      { baileysAuthDir: env.BAILEYS_AUTH_DIR },
      "BAILEYS_AUTH_DIR is using the default relative path in production; mount persistent storage such as /data/baileys_auth"
    );
  }

  if (/^connector-\d+$/.test(env.CONNECTOR_INSTANCE_ID)) {
    logger.warn(
      { connectorInstanceId: env.CONNECTOR_INSTANCE_ID },
      "CONNECTOR_INSTANCE_ID appears process-derived; set a stable explicit value in production to avoid lease churn after restart"
    );
  }
}

async function bootstrap() {
  await pool.query("select 1");
  logger.info("Connector database connection established");
  logDeploymentWarnings();

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
