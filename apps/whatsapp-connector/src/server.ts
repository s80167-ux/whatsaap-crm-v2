import fs from "node:fs";
import path from "node:path";
import { pool } from "./config/database.js";
import { env, rawBaileysAuthDir } from "./config/env.js";
import { logger } from "./config/logger.js";
import { app } from "./app.js";
import { ConnectorCommandService } from "./services/connectorCommandService.js";

function logDeploymentWarnings() {
  const isRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_ID);
  const isProductionLike = env.NODE_ENV === "production" || isRailway;
  const candidateMounts = ["/data", "/app/data"];
  const authDirExists = fs.existsSync(env.BAILEYS_AUTH_DIR);
  const authDirEntries = authDirExists ? fs.readdirSync(env.BAILEYS_AUTH_DIR) : [];
  const detectedMounts = candidateMounts.filter((candidateMount) => fs.existsSync(candidateMount));

  logger.info(
    {
      nodeEnv: env.NODE_ENV,
      isRailway,
      rawBaileysAuthDir,
      baileysAuthDir: env.BAILEYS_AUTH_DIR,
      authDirExists,
      authDirEntryCount: authDirEntries.length,
      detectedPersistentMounts: detectedMounts,
      connectorInstanceId: env.CONNECTOR_INSTANCE_ID
    },
    "Connector runtime configuration"
  );

  if (authDirExists) {
    logger.info(
      {
        baileysAuthDir: env.BAILEYS_AUTH_DIR,
        authDirEntries: authDirEntries.slice(0, 20)
      },
      "Connector auth directory snapshot"
    );
  }

  if (!isProductionLike) {
    return;
  }

  if (!path.isAbsolute(env.BAILEYS_AUTH_DIR)) {
    logger.warn(
      { rawBaileysAuthDir, baileysAuthDir: env.BAILEYS_AUTH_DIR },
      "BAILEYS_AUTH_DIR is not absolute in a production-like deployment; auth state may be lost on container restart"
    );
  }

  if (rawBaileysAuthDir === "./data/baileys_auth") {
    logger.warn(
      { rawBaileysAuthDir, baileysAuthDir: env.BAILEYS_AUTH_DIR },
      "BAILEYS_AUTH_DIR is using the default relative path in a production-like deployment; point it at the mounted Railway volume, for example /app/data/baileys_auth"
    );
  }

  if (rawBaileysAuthDir !== env.BAILEYS_AUTH_DIR) {
    logger.warn(
      { rawBaileysAuthDir, resolvedBaileysAuthDir: env.BAILEYS_AUTH_DIR },
      "BAILEYS_AUTH_DIR was auto-resolved onto a detected persistent mount; set it explicitly in production to keep deployments predictable"
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
