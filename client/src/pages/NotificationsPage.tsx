import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import type { NotificationSummary } from "core/constants/notification.ts";
import { NOTIFICATION_EVENT_LABEL } from "core/constants/notification.ts";
import type { NotificationEvent } from "core/constants/notification.ts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorAlert from "@/components/ErrorAlert";
import { Bell, CheckCheck, Trash2, ExternalLink } from "lucide-react";

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

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const { data, isLoading, error } = useQuery<{ notifications: NotificationSummary[] }>({
    queryKey: ["notifications-page", filter],
    queryFn: () =>
      axios
        .get(`/api/notifications?limit=50${filter === "unread" ? "&unread=true" : ""}`)
        .then((r) => r.data),
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["notifications-page"] });
    queryClient.invalidateQueries({ queryKey: ["notifications-count"] });
    queryClient.invalidateQueries({ queryKey: ["notifications-list"] });
  };

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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isLoading ? "Loading…" : `${notifications.length} notification${notifications.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => readAllMutation.mutate()}
              disabled={readAllMutation.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b">
        {(["all", "unread"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={[
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              filter === f
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {f === "all" ? "All" : "Unread"}
            {f === "unread" && unreadCount > 0 && (
              <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 h-4">
                {unreadCount}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {error && <ErrorAlert error={error} fallback="Failed to load notifications" />}

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="flex gap-3 p-4 border rounded-lg">
              <Skeleton className="h-8 w-8 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && notifications.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Bell className="h-10 w-10 mx-auto mb-3 opacity-25" />
          <p className="font-medium">
            {filter === "unread" ? "No unread notifications" : "No notifications yet"}
          </p>
          {filter === "unread" && (
            <Button variant="link" size="sm" onClick={() => setFilter("all")}>
              View all notifications
            </Button>
          )}
        </div>
      )}

      {!isLoading && notifications.length > 0 && (
        <div className="border rounded-xl overflow-hidden divide-y">
          {notifications.map((notification) => {
            const isUnread = !notification.readAt;
            const icon = EVENT_ICON[notification.event] ?? "🔔";
            const label = NOTIFICATION_EVENT_LABEL[notification.event as NotificationEvent] ?? notification.event;

            return (
              <div
                key={notification.id}
                className={[
                  "flex items-start gap-4 px-5 py-4 transition-colors",
                  isUnread ? "bg-primary/5" : "bg-background",
                ].join(" ")}
              >
                <span className="text-xl shrink-0 mt-0.5">{icon}</span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 justify-between">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${isUnread ? "font-semibold" : ""}`}>
                        {notification.title}
                      </p>
                      {notification.body && (
                        <p className="text-sm text-muted-foreground mt-0.5">{notification.body}</p>
                      )}
                    </div>
                    {isUnread && (
                      <span className="h-2.5 w-2.5 rounded-full bg-primary shrink-0 mt-1.5" />
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span>{label}</span>
                    <span>·</span>
                    <span>{timeAgo(notification.createdAt)}</span>
                    {notification.entityUrl && (
                      <>
                        <span>·</span>
                        <Link
                          to={notification.entityUrl}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                          onClick={() => { if (isUnread) readMutation.mutate(notification.id); }}
                        >
                          <ExternalLink className="h-3 w-3" />
                          View
                        </Link>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {isUnread && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      title="Mark as read"
                      onClick={() => readMutation.mutate(notification.id)}
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    title="Dismiss"
                    onClick={() => deleteMutation.mutate(notification.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
