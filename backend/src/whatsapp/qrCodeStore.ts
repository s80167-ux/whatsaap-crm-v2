// In-memory QR code store for WhatsApp accounts
import { logger } from "../config/logger.js";
const qrCodeStore = new Map();

export function setQrCode(accountId, qr) {
  logger.info({ accountId, qrPreview: qr?.slice?.(0, 10) }, "[qrCodeStore] setQrCode");
  qrCodeStore.set(accountId, { qr, timestamp: Date.now() });
}

export function getQrCode(accountId) {
  const entry = qrCodeStore.get(accountId);
  if (entry && Date.now() - entry.timestamp < 2 * 60 * 1000) {
    logger.info({ accountId, hasQr: true }, "[qrCodeStore] getQrCode: found");
    return entry.qr;
  }
  logger.info({ accountId, hasQr: false }, "[qrCodeStore] getQrCode: not found or expired");
  return null;
}

export function clearQrCode(accountId) {
  logger.info({ accountId }, "[qrCodeStore] clearQrCode");
  qrCodeStore.delete(accountId);
}
