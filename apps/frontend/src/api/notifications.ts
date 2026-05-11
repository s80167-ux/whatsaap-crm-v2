import { apiGet, apiPatch } from "../lib/http";
import type { NotificationItem } from "../types/api";

export async function fetchNotifications(limit = 20) {
  const response = await apiGet<{ data: NotificationItem[]; unreadCount: number }>(`/notifications?limit=${limit}`);
  return response;
}

export async function markNotificationRead(notificationId: string) {
  await apiPatch<{ ok: true }>(`/notifications/${notificationId}/read`, {});
}

export async function markAllNotificationsRead() {
  await apiPatch<{ ok: true }>("/notifications/read-all", {});
}
