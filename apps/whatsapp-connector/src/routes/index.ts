import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  health,
  initializeAccountSession,
  initializeAllSessions,
  reconnectAccountSession,
  backfillAccountSession,
  getAccountSessionStatus,
  listAccountContacts,
  syncAccountContacts,
  sendAccountMessage,
  verifyPhoneOnWhatsApp,
  fetchProfilePicture,
  terminateAccountSession
} from "../controllers/connectorController.js";
import { requireInternalSecret } from "../middleware/internalAuth.js";

export const router = Router();

router.get("/health", asyncHandler(health));
router.use("/internal", requireInternalSecret);
router.post("/internal/sessions/initialize-all", asyncHandler(initializeAllSessions));
router.post("/internal/accounts/:accountId/connect", asyncHandler(initializeAccountSession));
router.post("/internal/accounts/:accountId/reconnect", asyncHandler(reconnectAccountSession));
router.post("/internal/accounts/:accountId/backfill", asyncHandler(backfillAccountSession));
router.get("/internal/accounts/:accountId/status", asyncHandler(getAccountSessionStatus));
router.get("/internal/accounts/:accountId/contacts", asyncHandler(listAccountContacts));
router.post("/internal/accounts/:accountId/contacts/sync", asyncHandler(syncAccountContacts));
router.post("/internal/accounts/:accountId/on-whatsapp", asyncHandler(verifyPhoneOnWhatsApp));
router.post("/internal/accounts/:accountId/profile-picture", asyncHandler(fetchProfilePicture));
router.delete("/internal/accounts/:accountId/session", asyncHandler(terminateAccountSession));
router.post("/internal/messages/send", asyncHandler(sendAccountMessage));
