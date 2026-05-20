import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireRole } from "../../middleware/authMiddleware.js";
import {
  getOpsCenterCampaignDispatch,
  getOpsCenterConnectors,
  getOpsCenterOrganizations,
  getOpsCenterOutbox,
  getOpsCenterRawEvents,
  getOpsCenterSummary,
  rebuildOpsCenterProjections,
  replayOpsCenterRawEvents,
  retryOpsCenterOutboxJob,
  retryOpsCenterRawEvent
} from "./opsCenter.controller.js";

export const opsCenterRoutes = Router();

opsCenterRoutes.use(requireRole(["super_admin"]));

opsCenterRoutes.get("/summary", asyncHandler(getOpsCenterSummary));
opsCenterRoutes.get("/connectors", asyncHandler(getOpsCenterConnectors));
opsCenterRoutes.get("/raw-events", asyncHandler(getOpsCenterRawEvents));
opsCenterRoutes.post("/raw-events/replay", asyncHandler(replayOpsCenterRawEvents));
opsCenterRoutes.post("/raw-events/:eventId/retry", asyncHandler(retryOpsCenterRawEvent));
opsCenterRoutes.get("/outbox", asyncHandler(getOpsCenterOutbox));
opsCenterRoutes.post("/outbox/:jobId/retry", asyncHandler(retryOpsCenterOutboxJob));
opsCenterRoutes.get("/campaign-dispatch", asyncHandler(getOpsCenterCampaignDispatch));
opsCenterRoutes.post("/projections/rebuild", asyncHandler(rebuildOpsCenterProjections));
opsCenterRoutes.get("/organizations", asyncHandler(getOpsCenterOrganizations));
