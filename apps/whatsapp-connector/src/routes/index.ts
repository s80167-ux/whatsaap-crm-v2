import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  health,
  initializeAccountSession,
  initializeAllSessions,
  reconnectAccountSession,
  sendAccountMessage,
  terminateAccountSession
} from "../controllers/connectorController.js";
import { requireInternalSecret } from "../middleware/internalAuth.js";

export const router = Router();

router.get("/health", asyncHandler(health));
router.use("/internal", requireInternalSecret);
router.post("/internal/sessions/initialize-all", asyncHandler(initializeAllSessions));
router.post("/internal/accounts/:accountId/connect", asyncHandler(initializeAccountSession));
router.post("/internal/accounts/:accountId/reconnect", asyncHandler(reconnectAccountSession));
router.delete("/internal/accounts/:accountId/session", asyncHandler(terminateAccountSession));
router.post("/internal/messages/send", asyncHandler(sendAccountMessage));
