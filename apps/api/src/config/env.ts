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
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(2),
  DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  API_PUBLIC_URL: z.string().url().optional(),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  SESSION_COOKIE_NAME: z.string().min(1).default("crm_session"),
  REFRESH_COOKIE_NAME: z.string().min(1).default("crm_refresh"),
  CSRF_COOKIE_NAME: z.string().min(1).default("crm_csrf"),
  COOKIE_SECURE: z.coerce.boolean().optional(),
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  COOKIE_DOMAIN: z.string().min(1).optional(),
  COOKIE_MAX_AGE_MS: z.coerce.number().int().positive().default(1000 * 60 * 60 * 24 * 30),
  TRUST_PROXY: z.coerce.boolean().default(false),
  BAILEYS_AUTH_DIR: z.string().default("./data/baileys_auth"),
  CONNECTOR_BASE_URL: z.string().url().default("http://localhost:4010"),
  CONNECTOR_INTERNAL_SECRET: z.string().min(1).default("rezeki_crm_connector_2026_x7Kp91LmQ2s8"),
  ALLOW_LOCAL_CONNECTOR_SEND: z.coerce.boolean().default(false),
  OUTBOUND_DISPATCH_MODE: z.enum(["worker_only", "immediate"]).optional(),
  EMBED_RAW_EVENT_WORKER: z.coerce.boolean().optional(),
  RAW_EVENT_WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(50),
  RAW_EVENT_WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(500),
  RAW_EVENT_WORKER_STALE_AFTER_MS: z.coerce.number().int().positive().default(120000),
  RAW_EVENT_WORKER_MAX_RETRIES: z.coerce.number().int().min(1).default(10),
  MESSAGE_OUTBOX_WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(25),
  MESSAGE_OUTBOX_WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(3000),
  MESSAGE_OUTBOX_WORKER_STALE_AFTER_MS: z.coerce.number().int().positive().default(120000),
  MESSAGE_OUTBOX_WORKER_MAX_RETRIES: z.coerce.number().int().min(1).default(10),
  CAMPAIGN_DISPATCH_WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(10),
  CAMPAIGN_DISPATCH_WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  CAMPAIGN_DISPATCH_WORKER_STALE_AFTER_MS: z.coerce.number().int().positive().default(600000),
  CAMPAIGN_DISPATCH_WORKER_MAX_RETRIES: z.coerce.number().int().min(1).default(3),
  DEEPSEEK_API_KEY: z.string().min(1).optional(),
  DEEPSEEK_MODEL: z.string().min(1).default("deepseek-v4-flash"),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  META_APP_ID: z.string().min(1).optional(),
  META_APP_SECRET: z.string().min(1).optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(1).optional(),
  META_REDIRECT_URI: z.string().url().optional(),
  META_GRAPH_API_VERSION: z.string().min(1).default("v20.0"),
  SOCIAL_TOKEN_ENCRYPTION_KEY: z.string().min(1).optional(),
  SOCIAL_EVENT_WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(25),
  SOCIAL_EVENT_WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(3000),
  DEFAULT_ORGANIZATION_ID: z.string().uuid().optional()
});

const parsedEnv = envSchema.parse({
  ...process.env,
  SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
});

const apiPublicUrl =
  parsedEnv.API_PUBLIC_URL ??
  (parsedEnv.NODE_ENV === "production"
    ? (() => {
        throw new Error("API_PUBLIC_URL is required in production for OAuth callbacks");
      })()
    : `http://localhost:${parsedEnv.PORT}`);

export const env = {
  ...parsedEnv,
  API_PUBLIC_URL: apiPublicUrl,
  COOKIE_SECURE: parsedEnv.COOKIE_SECURE ?? parsedEnv.NODE_ENV === "production",
  OUTBOUND_DISPATCH_MODE:
    parsedEnv.OUTBOUND_DISPATCH_MODE ?? (parsedEnv.NODE_ENV === "production" ? "worker_only" : "immediate"),
  EMBED_RAW_EVENT_WORKER: parsedEnv.EMBED_RAW_EVENT_WORKER ?? parsedEnv.NODE_ENV === "production"
};
