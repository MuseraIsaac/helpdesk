import { useParams } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { portalReplySchema, type PortalReplyInput } from "core/schemas/portal.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import BackLink from "@/components/BackLink";

interface Reply {
  id: number;
  body: string;
  bodyHtml: string | null;
  senderType: "agent" | "customer";
  createdAt: string;
}

interface PortalTicketDetail {
  id: number;
  subject: string;
  body: string;
  bodyHtml: string | null;
  status: string;
  category: string | null;
  createdAt: string;
  updatedAt: string;
  replies: Reply[];
}

const STATUS_LABEL: Record<string, string> = {
  new: "Received",
  processing: "Under Review",
  open: "Open",
  resolved: "Resolved",
  closed: "Closed",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  new: "secondary",
  processing: "secondary",
  open: "default",
  resolved: "outline",
  closed: "outline",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PortalTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["portal-ticket", id],
    queryFn: async () => {
      const { data } = await axios.get<{ ticket: PortalTicketDetail }>(
        `/api/portal/tickets/${id}`
      );
      return data.ticket;
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<PortalReplyInput>({ resolver: zodResolver(portalReplySchema) });

  const bodyValue = watch("body");

  const replyMutation = useMutation({
    mutationFn: async (payload: PortalReplyInput) => {
      const { data: reply } = await axios.post(
        `/api/portal/tickets/${id}/replies`,
        payload
      );
      return reply;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["portal-tickets"] });
      reset();
    },
  });

  const isClosed = data?.status === "closed";

  return (
    <div className="space-y-6">
      <BackLink to="/portal/tickets">Back to my tickets</BackLink>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {error && (
        <ErrorAlert
          message={
            axios.isAxiosError(error) && error.response?.status === 404
              ? "Ticket not found"
              : "Failed to load ticket"
          }
        />
      )}

      {data && (
        <div className="space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-start gap-3 flex-wrap">
              <h1 className="text-xl font-semibold flex-1 min-w-0">
                {data.subject}
              </h1>
              <Badge variant={STATUS_VARIANT[data.status] ?? "secondary"}>
                {STATUS_LABEL[data.status] ?? data.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Submitted {formatDateTime(data.createdAt)}
            </p>
          </div>

          {/* Original message */}
          <div className="rounded-lg border p-4 bg-muted/30 space-y-1">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Your original message
            </p>
            {data.bodyHtml ? (
              <div
                className="prose prose-sm max-w-none text-foreground"
                dangerouslySetInnerHTML={{ __html: data.bodyHtml }}
              />
            ) : (
              <p className="text-sm whitespace-pre-wrap">{data.body}</p>
            )}
          </div>

          {/* Replies */}
          {data.replies.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Conversation
              </h2>
              {data.replies.map((reply) => (
                <div
                  key={reply.id}
                  className={`rounded-lg border p-4 space-y-1 ${
                    reply.senderType === "agent"
                      ? "bg-primary/5 border-primary/20"
                      : "bg-background"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium">
                      {reply.senderType === "agent" ? "Support Team" : "You"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(reply.createdAt)}
                    </span>
                  </div>
                  {reply.bodyHtml ? (
                    <div
                      className="prose prose-sm max-w-none text-foreground"
                      dangerouslySetInnerHTML={{ __html: reply.bodyHtml }}
                    />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{reply.body}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Reply form */}
          {!isClosed && (
            <div className="space-y-3 pt-2">
              <h2 className="text-sm font-semibold">Send a reply</h2>
              {replyMutation.error && (
                <ErrorAlert
                  error={replyMutation.error}
                  fallback="Failed to send reply"
                />
              )}
              <form
                onSubmit={handleSubmit((payload) =>
                  replyMutation.mutate(payload)
                )}
                className="space-y-3"
              >
                <Textarea
                  placeholder="Type your message..."
                  rows={4}
                  {...register("body")}
                />
                {errors.body && <ErrorMessage message={errors.body.message} />}
                <Button
                  type="submit"
                  disabled={!bodyValue?.trim() || replyMutation.isPending}
                >
                  {replyMutation.isPending ? "Sending..." : "Send Reply"}
                </Button>
              </form>
            </div>
          )}

          {isClosed && (
            <p className="text-sm text-muted-foreground border rounded-lg px-4 py-3">
              This ticket is closed. Please submit a new ticket if you need
              further assistance.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
