import crypto from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
let warnedAboutDevFallback = false;

function getEncryptionKey() {
  const configuredSecret = env.SOCIAL_TOKEN_ENCRYPTION_KEY;

  if (!configuredSecret && env.NODE_ENV === "production") {
    throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY is required in production for social channel tokens");
  }

  if (!configuredSecret && !warnedAboutDevFallback) {
    warnedAboutDevFallback = true;
    logger.warn("SOCIAL_TOKEN_ENCRYPTION_KEY is missing; using development-only fallback for social channel tokens");
  }

  return crypto
    .createHash("sha256")
    .update(configuredSecret ?? "development-social-token-encryption-key")
    .digest();
}

export function encryptSocialToken(token: string) {
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `v1:${iv.toString("base64url")}:${authTag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptSocialToken(encryptedToken: string) {
  const [version, ivValue, authTagValue, encryptedValue] = encryptedToken.split(":");

  if (version !== "v1" || !ivValue || !authTagValue || !encryptedValue) {
    throw new Error("Unsupported social token encryption format");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}
