import crypto from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
let warnedAboutDevFallback = false;

function getEncryptionKey() {
  const configuredSecret = env.TOKEN_ENCRYPTION_SECRET ?? env.EMAIL_SECRET_KEY ?? env.SOCIAL_TOKEN_ENCRYPTION_KEY;

  if (!configuredSecret && env.NODE_ENV === "production") {
    throw new Error("TOKEN_ENCRYPTION_SECRET or EMAIL_SECRET_KEY is required in production for email sender secrets");
  }

  if (!configuredSecret && !warnedAboutDevFallback) {
    warnedAboutDevFallback = true;
    logger.warn("TOKEN_ENCRYPTION_SECRET is missing; using development-only fallback for email sender secrets");
  }

  return crypto
    .createHash("sha256")
    .update(configuredSecret ?? "development-email-secret-key")
    .digest();
}

export function encryptEmailSecret(value: string) {
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `v1:${iv.toString("base64url")}:${authTag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptEmailSecret(encryptedValue: string) {
  const [version, ivValue, authTagValue, ciphertextValue] = encryptedValue.split(":");

  if (version !== "v1" || !ivValue || !authTagValue || !ciphertextValue) {
    throw new Error("Unsupported email secret encryption format");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}
