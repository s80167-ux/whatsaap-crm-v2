import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireRole } from "../../middleware/authMiddleware.js";
import {
  connectMetaPage,
  createSocialChannelAccount,
  deleteSocialChannelAccount,
  disconnectSocialChannelAccount,
  exchangeMetaCode,
  getMetaConnectUrl,
  getSocialChannelAccountStatus,
  listSocialChannelAccounts,
  resubscribeSocialChannelAccount,
  updateSocialChannelAccount
} from "./socialChannels.controller.js";

export const socialChannelsRoutes = Router();

socialChannelsRoutes.get("/accounts", asyncHandler(listSocialChannelAccounts));
socialChannelsRoutes.post(
  "/accounts",
  requireRole(["super_admin", "org_admin"]),
  asyncHandler(createSocialChannelAccount)
);
socialChannelsRoutes.get("/meta/connect-url", asyncHandler(getMetaConnectUrl));
socialChannelsRoutes.post("/meta/exchange-code", asyncHandler(exchangeMetaCode));
socialChannelsRoutes.post("/meta/connect-page", asyncHandler(connectMetaPage));
socialChannelsRoutes.get("/accounts/:accountId/status", asyncHandler(getSocialChannelAccountStatus));
socialChannelsRoutes.patch(
  "/accounts/:accountId",
  requireRole(["super_admin", "org_admin"]),
  asyncHandler(updateSocialChannelAccount)
);
socialChannelsRoutes.delete(
  "/accounts/:accountId",
  requireRole(["super_admin", "org_admin"]),
  asyncHandler(deleteSocialChannelAccount)
);
socialChannelsRoutes.post(
  "/accounts/:accountId/disconnect",
  requireRole(["super_admin", "org_admin"]),
  asyncHandler(disconnectSocialChannelAccount)
);
socialChannelsRoutes.post(
  "/accounts/:accountId/resubscribe",
  requireRole(["super_admin", "org_admin"]),
  asyncHandler(resubscribeSocialChannelAccount)
);
