import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { ZodError } from "zod";
import { isAppError } from "../../../lib/errors.js";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import {
  getMobileV1Contact,
  getMobileV1Contacts,
  getMobileV1Inbox,
  getMobileV1InboxEvents,
  getMobileV1InboxMessages,
  getMobileV1Lead,
  getMobileV1Leads,
  getMobileV1Me,
  getMobileV1QuickReplies,
  recordMobileV1QuickReplyUsage,
  sendMobileV1Message,
  updateMobileV1Contact,
  updateMobileV1Lead
} from "./mobileV1.controller.js";

export const mobileV1Routes = Router();

function requireAnyMobilePermission(permissionKeys: string[]) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.auth) {
      return response.status(401).json({ error: "Authentication required", code: "auth_required" });
    }

    if (request.auth.role === "super_admin") {
      return next();
    }

    const hasPermission = permissionKeys.some((permissionKey) => request.auth?.permissionKeys.includes(permissionKey));

    if (!hasPermission) {
      return response.status(403).json({ error: "Insufficient permissions", code: "forbidden" });
    }

    return next();
  };
}

function requireMobilePermission(permissionKey: string) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.auth) {
      return response.status(401).json({ error: "Authentication required", code: "auth_required" });
    }

    if (request.auth.role === "super_admin" || request.auth.permissionKeys.includes(permissionKey)) {
      return next();
    }

    return response.status(403).json({ error: "Insufficient permissions", code: "forbidden" });
  };
}

mobileV1Routes.get("/me", asyncHandler(getMobileV1Me));
mobileV1Routes.get(
  "/inbox",
  requireAnyMobilePermission(["conversations.read_all", "conversations.read_assigned"]),
  asyncHandler(getMobileV1Inbox)
);
mobileV1Routes.get(
  "/inbox/events",
  requireAnyMobilePermission(["conversations.read_all", "conversations.read_assigned"]),
  getMobileV1InboxEvents
);
mobileV1Routes.get(
  "/inbox/:conversationId/messages",
  requireAnyMobilePermission(["conversations.read_all", "conversations.read_assigned"]),
  asyncHandler(getMobileV1InboxMessages)
);
mobileV1Routes.get(
  "/contacts",
  requireAnyMobilePermission(["contacts.read_all", "contacts.read_assigned"]),
  asyncHandler(getMobileV1Contacts)
);
mobileV1Routes.get(
  "/contacts/:contactId",
  requireAnyMobilePermission(["contacts.read_all", "contacts.read_assigned"]),
  asyncHandler(getMobileV1Contact)
);
mobileV1Routes.patch(
  "/contacts/:contactId",
  requireMobilePermission("contacts.write"),
  asyncHandler(updateMobileV1Contact)
);
mobileV1Routes.get(
  "/leads",
  requireAnyMobilePermission(["sales.read_all", "sales.read_assigned"]),
  asyncHandler(getMobileV1Leads)
);
mobileV1Routes.get(
  "/leads/:leadId",
  requireAnyMobilePermission(["sales.read_all", "sales.read_assigned"]),
  asyncHandler(getMobileV1Lead)
);
mobileV1Routes.patch(
  "/leads/:leadId",
  requireMobilePermission("sales.write"),
  asyncHandler(updateMobileV1Lead)
);
mobileV1Routes.get(
  "/quick-replies",
  asyncHandler(getMobileV1QuickReplies)
);
mobileV1Routes.post(
  "/quick-replies/:templateId/usage",
  requireMobilePermission("messages.send"),
  asyncHandler(recordMobileV1QuickReplyUsage)
);
mobileV1Routes.post(
  "/messages/send",
  requireMobilePermission("messages.send"),
  asyncHandler(sendMobileV1Message)
);

mobileV1Routes.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
  if (response.headersSent) {
    return next(error);
  }

  if (error instanceof ZodError) {
    return response.status(400).json({
      error: "Validation failed",
      code: "validation_failed"
    });
  }

  if (isAppError(error)) {
    return response.status(error.statusCode).json({
      error: error.message,
      code: error.code
    });
  }

  return response.status(500).json({
    error: error instanceof Error ? error.message : "Internal server error",
    code: "internal_error"
  });
});
