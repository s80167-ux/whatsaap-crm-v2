import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import {
  createSocialChannelAccount,
  deleteSocialChannelAccount,
  disconnectSocialChannelAccount,
  exchangeMetaCode,
  getMetaConnectUrl,
  getSocialChannelAccountStatus,
  listSocialChannelAccounts,
  updateSocialChannelAccount
} from "./socialChannels.controller.js";

export const socialChannelsRoutes = Router();

socialChannelsRoutes.get("/accounts", asyncHandler(listSocialChannelAccounts));
socialChannelsRoutes.post("/accounts", asyncHandler(createSocialChannelAccount));
socialChannelsRoutes.get("/meta/connect-url", asyncHandler(getMetaConnectUrl));
socialChannelsRoutes.post("/meta/exchange-code", asyncHandler(exchangeMetaCode));
socialChannelsRoutes.get("/accounts/:accountId/status", asyncHandler(getSocialChannelAccountStatus));
socialChannelsRoutes.patch("/accounts/:accountId", asyncHandler(updateSocialChannelAccount));
socialChannelsRoutes.delete("/accounts/:accountId", asyncHandler(deleteSocialChannelAccount));
socialChannelsRoutes.post("/accounts/:accountId/disconnect", asyncHandler(disconnectSocialChannelAccount));
