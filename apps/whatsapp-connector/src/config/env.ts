import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const connectorEnvPath = path.resolve(currentDirPath, "../../.env");
const workspaceConnectorEnvPath = path.resolve(process.cwd(), "apps/whatsapp-connector/.env");
const rootEnvPath = path.resolve(process.cwd(), ".env");

for (const envPath of [connectorEnvPath, workspaceConnectorEnvPath, rootEnvPath]) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
  }
}

function defaultConnectorInstanceId() {
  const railwayServiceId = process.env.RAILWAY_SERVICE_ID?.trim();
  const railwayServiceName = process.env.RAILWAY_SERVICE_NAME?.trim();

  if (railwayServiceId) {
    return `railway-${railwayServiceId}`;
  }

  if (railwayServiceName) {
    return `railway-${railwayServiceName}`;
  }

  return `connector-${process.pid}`;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4010),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine(
      (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
      "DATABASE_URL must be a PostgreSQL connection string"
    ),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(2),
  DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  BAILEYS_AUTH_DIR: z.string().default("./data/baileys_auth"),
  WHATSAPP_AUTH_DIR: z.string().optional(),
  CONNECTOR_INTERNAL_SECRET: z.string().min(1),
  CONNECTOR_INSTANCE_ID: z.string().min(1).default(defaultConnectorInstanceId()),
  CONNECTOR_LEASE_TTL_MS: z.coerce.number().int().positive().default(30000),
  CONNECTOR_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(10000),
  CONNECTOR_MAX_CONSECUTIVE_RECONNECT_FAILURES: z.coerce.number().int().min(1).default(5),
  ALLOW_NON_PRODUCTION_REMOTE_CONNECTOR: z.coerce.boolean().default(false)
});

const parsedEnv = envSchema.parse({
  ...process.env,
  BAILEYS_AUTH_DIR: process.env.BAILEYS_AUTH_DIR ?? process.env.WHATSAPP_AUTH_DIR
});

function resolveBaileysAuthDir(rawAuthDir: string): string {
  const isRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_ID);
  const isProductionLike = parsedEnv.NODE_ENV === "production" || isRailway;

  if (!isProductionLike || path.isAbsolute(rawAuthDir)) {
    return rawAuthDir;
  }

  const normalizedRelativePath = rawAuthDir.replace(/\\/g, "/").replace(/^\.\//, "");
  const candidateMounts = ["/data", "/app/data"];

  for (const candidateMount of candidateMounts) {
    if (!fs.existsSync(candidateMount)) {
      continue;
    }

    const relativeSuffix =
      candidateMount.endsWith("/data") && normalizedRelativePath.startsWith("data/")
        ? normalizedRelativePath.slice("data/".length)
        : normalizedRelativePath;

    return path.posix.join(candidateMount, relativeSuffix);
  }

  return rawAuthDir;
}

export const rawBaileysAuthDir = parsedEnv.BAILEYS_AUTH_DIR;

export const env = {
  ...parsedEnv,
  BAILEYS_AUTH_DIR: resolveBaileysAuthDir(parsedEnv.BAILEYS_AUTH_DIR)
};