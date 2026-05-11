import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "./notifications.controller.js";

export const notificationsRoutes = Router();

notificationsRoutes.get("/", asyncHandler(listNotifications));
notificationsRoutes.patch("/read-all", asyncHandler(markAllNotificationsRead));
notificationsRoutes.patch("/:notificationId/read", asyncHandler(markNotificationRead));
