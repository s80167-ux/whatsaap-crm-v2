import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const backendEnvPath = path.resolve(currentDirPath, "../../.env");
const rootEnvPath = path.resolve(process.cwd(), ".env");

for (const envPath of [backendEnvPath, rootEnvPath]) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine(
      (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
      "DATABASE_URL must be a PostgreSQL connection string, for example postgresql://user:pass@host:5432/dbname"
    ),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  BAILEYS_AUTH_DIR: z.string().default("./data/baileys_auth"),
  CONNECTOR_BASE_URL: z.string().url().default("http://localhost:4010"),
  CONNECTOR_INTERNAL_SECRET: z.string().min(1).default("change-me"),
  RAW_EVENT_WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(50),
  RAW_EVENT_WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(3000),
  RAW_EVENT_WORKER_STALE_AFTER_MS: z.coerce.number().int().positive().default(120000),
  RAW_EVENT_WORKER_MAX_RETRIES: z.coerce.number().int().min(1).default(10),
  MESSAGE_OUTBOX_WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(25),
  MESSAGE_OUTBOX_WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(3000),
  MESSAGE_OUTBOX_WORKER_STALE_AFTER_MS: z.coerce.number().int().positive().default(120000),
  MESSAGE_OUTBOX_WORKER_MAX_RETRIES: z.coerce.number().int().min(1).default(10),
  DEFAULT_ORGANIZATION_ID: z.string().uuid().optional()
});

export const env = envSchema.parse({
  ...process.env,
  SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
});
