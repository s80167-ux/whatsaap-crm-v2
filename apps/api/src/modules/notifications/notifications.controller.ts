import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { NotificationsService } from "./notifications.service.js";

const notificationsService = new NotificationsService();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).optional()
});

const notificationParamsSchema = z.object({
  notificationId: z.string().uuid()
});

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

export async function listNotifications(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { limit } = listQuerySchema.parse(request.query);
  const result = await notificationsService.list(auth, limit);

  return response.json({
    data: result.notifications,
    unreadCount: result.unreadCount
  });
}

export async function markNotificationRead(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { notificationId } = notificationParamsSchema.parse(request.params);

  await notificationsService.markRead(auth, notificationId);

  return response.json({ ok: true });
}

export async function markAllNotificationsRead(request: Request, response: Response) {
  const auth = requireAuth(request);

  await notificationsService.markAllRead(auth);

  return response.json({ ok: true });
}
