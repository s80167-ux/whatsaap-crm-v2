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
  BAILEYS_AUTH_DIR: z.string().default("./data/baileys_auth"),
  CONNECTOR_INTERNAL_SECRET: z.string().min(1),
  CONNECTOR_INSTANCE_ID: z.string().min(1).default(`connector-${process.pid}`),
  CONNECTOR_LEASE_TTL_MS: z.coerce.number().int().positive().default(30000),
  CONNECTOR_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(10000)
});

export const env = envSchema.parse(process.env);
