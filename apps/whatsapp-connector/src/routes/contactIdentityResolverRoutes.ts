import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireInternalSecret } from "../middleware/internalAuth.js";
import { resolveContactIdentity } from "../controllers/contactIdentityResolverController.js";

export const contactIdentityResolverRouter = Router();

contactIdentityResolverRouter.use("/internal", requireInternalSecret);
contactIdentityResolverRouter.post(
  "/internal/accounts/:accountId/resolve-contact-identity",
  asyncHandler(resolveContactIdentity)
);
