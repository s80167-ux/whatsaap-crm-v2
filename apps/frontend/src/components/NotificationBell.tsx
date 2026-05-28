import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import clsx from "clsx";
import { useNavigate } from "react-router-dom";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "../hooks/useNotifications";
import { useRefetchOnPageActive } from "../hooks/useRefetchOnPageActive";
import { useRealtimeNotifications } from "../hooks/useRealtimeNotifications";
import type { NotificationItem } from "../types/api";
import "./notification-bell.css";

export function NotificationBell() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const { data, isLoading, refetch } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  useRealtimeNotifications();
  useRefetchOnPageActive(() => {
    void refetch();
  });
  const notifications = data?.data ?? [];
  const unreadCount = data?.unreadCount ?? 0;
  const unreadLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  async function handleNotificationClick(notification: NotificationItem) {
    await markRead.mutateAsync(notification.id);
    setIsOpen(false);

    if (notification.target_path) {
      navigate(notification.target_path);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="topbar-profile-trigger relative inline-flex h-8 w-8 items-center justify-center rounded-xl border px-0 text-topbar-foreground transition duration-200"
        aria-label="Open notifications"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <Bell size={16} />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground shadow-[0_0_0_2px_rgb(var(--topbar)/0.6)]">
            {unreadLabel}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="notification-bell-panel absolute right-0 top-10 z-[140] w-[min(calc(100vw-1.5rem),24rem)] overflow-hidden text-card-foreground">
          <div className="notification-bell-panel__header flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-card-foreground">Notifications</p>
              <p className="text-xs text-muted-foreground">{unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}</p>
            </div>
            <button
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground transition hover:bg-card hover:text-foreground disabled:opacity-50"
              aria-label="Mark all notifications as read"
              disabled={unreadCount === 0 || markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
            >
              {markAllRead.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
            </button>
          </div>

          <div className="notification-bell-panel__list max-h-[min(70vh,28rem)] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading notifications
              </div>
            ) : notifications.length > 0 ? (
              notifications.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  disabled={markRead.isPending}
                  onClick={() => void handleNotificationClick(notification)}
                />
              ))
            ) : (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications yet.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NotificationRow({
  disabled,
  notification,
  onClick
}: {
  disabled: boolean;
  notification: NotificationItem;
  onClick: () => void;
}) {
  const isUnread = !notification.read_at;
  const timeLabel = useMemo(() => formatRelativeTime(notification.updated_at || notification.created_at), [
    notification.created_at,
    notification.updated_at
  ]);

  return (
    <button
      type="button"
      className={clsx(
        "notification-bell-row flex w-full items-start gap-3 px-4 py-3 text-left transition last:border-b-0 disabled:cursor-wait",
        isUnread && "notification-bell-row--unread"
      )}
      disabled={disabled}
      onClick={onClick}
    >
      <span
        className={clsx(
          "mt-1 h-2 w-2 shrink-0 rounded-full",
          isUnread ? "bg-primary shadow-[0_0_0_4px_rgb(var(--primary)/0.14)]" : "bg-border"
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="notification-bell-row__title block truncate text-sm font-semibold text-card-foreground">{notification.title}</span>
        {notification.message ? (
          <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">{notification.message}</span>
        ) : null}
        <span className="mt-1 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">{timeLabel}</span>
      </span>
    </button>
  );
}

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "Just now";
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  if (diffSeconds < 60) {
    return "Just now";
  }

  const diffMinutes = Math.floor(diffSeconds / 60);

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);

  return `${diffDays}d ago`;
}
