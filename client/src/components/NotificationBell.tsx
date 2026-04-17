import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import axios from "axios";
import { Bell, Check, CheckCheck, Trash2, X } from "lucide-react";
import type { NotificationSummary } from "core/constants/notification.ts";
import { NOTIFICATION_EVENT_LABEL } from "core/constants/notification.ts";
import type { NotificationEvent } from "core/constants/notification.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ── Event icons ───────────────────────────────────────────────────────────────

const EVENT_ICON: Record<string, string> = {
  "ticket.assigned":            "🎫",
  "sla.first_response_warning": "⚠️",
  "sla.resolution_warning":     "⚠️",
  "sla.breached":               "🔴",
  "approval.requested":         "✋",
  "approval.approved":          "✅",
  "approval.rejected":          "❌",
  "incident.major_flagged":     "🚨",
  "request.approved":           "✅",
  "request.rejected":           "❌",
  "change.awaiting_approval":   "🔄",
};

// ── Time formatting ───────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ── Notification item ─────────────────────────────────────────────────────────

function NotificationItem({
  notification,
  onRead,
  onDelete,
}: {
  notification: NotificationSummary;
  onRead: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const isUnread = !notification.readAt;
  const icon = EVENT_ICON[notification.event] ?? "🔔";
  const label = NOTIFICATION_EVENT_LABEL[notification.event as NotificationEvent] ?? notification.event;

  const content = (
    <div
      className={[
        "flex items-start gap-3 px-4 py-3 transition-colors",
        isUnread ? "bg-primary/5" : "",
        notification.entityUrl ? "cursor-pointer hover:bg-accent/50" : "",
      ].join(" ")}
      onClick={() => { if (isUnread) onRead(notification.id); }}
    >
      <span className="text-base shrink-0 mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm leading-snug ${isUnread ? "font-medium" : ""} truncate`}>
            {notification.title}
          </p>
          {isUnread && (
            <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
          )}
        </div>
        {notification.body && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notification.body}</p>
        )}
        <p className="text-[11px] text-muted-foreground mt-1">{label} · {timeAgo(notification.createdAt)}</p>
      </div>
      <button
        className="opacity-0 group-hover/item:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-opacity shrink-0"
        onClick={(e) => { e.stopPropagation(); onDelete(notification.id); }}
        aria-label="Dismiss"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );

  if (notification.entityUrl) {
    return (
      <div className="group/item border-b last:border-b-0">
        <Link to={notification.entityUrl} onClick={() => { if (isUnread) onRead(notification.id); }}>
          {content}
        </Link>
      </div>
    );
  }

  return <div className="group/item border-b last:border-b-0">{content}</div>;
}

// ── Bell + panel ──────────────────────────────────────────────────────────────

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Poll unread count every 30s
  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ["notifications-count"],
    queryFn: () => axios.get("/api/notifications/unread-count").then((r) => r.data),
    refetchInterval: 30_000,
  });

  // Load full notification list when panel is open
  const { data: listData, isLoading } = useQuery<{ notifications: NotificationSummary[] }>({
    queryKey: ["notifications-list"],
    queryFn: () => axios.get("/api/notifications?limit=30").then((r) => r.data),
    enabled: open,
    staleTime: 10_000,
  });

  const unreadCount = countData?.count ?? 0;
  const notifications = listData?.notifications ?? [];

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["notifications-count"] });
    queryClient.invalidateQueries({ queryKey: ["notifications-list"] });
  }, [queryClient]);

  const readMutation = useMutation({
    mutationFn: (id: number) => axios.patch(`/api/notifications/${id}/read`),
    onSuccess: invalidate,
  });

  const readAllMutation = useMutation({
    mutationFn: () => axios.post("/api/notifications/read-all"),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axios.delete(`/api/notifications/${id}`),
    onSuccess: invalidate,
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((x) => !x)}
        className="relative p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 max-h-[32rem] flex flex-col rounded-xl border bg-background shadow-lg z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Notifications</h3>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 h-4">
                  {unreadCount} unread
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => readAllMutation.mutate()}
                  disabled={readAllMutation.isPending}
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </Button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="flex gap-3">
                    <Skeleton className="h-6 w-6 rounded" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!isLoading && notifications.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-25" />
                <p className="text-sm">All caught up!</p>
              </div>
            )}

            {!isLoading && notifications.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                onRead={(id) => readMutation.mutate(id)}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            ))}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t px-4 py-2 shrink-0">
              <Link
                to="/notifications"
                className="text-xs text-primary hover:underline"
                onClick={() => setOpen(false)}
              >
                View all notifications
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
