import { useState } from "react";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { type Ticket } from "core/constants/ticket.ts";
import ErrorAlert from "@/components/ErrorAlert";
import BackLink from "@/components/BackLink";
import TicketDetailSkeleton from "@/components/TicketDetailSkeleton";
import TicketDetail from "@/components/TicketDetail";
import UpdateTicket from "@/components/UpdateTicket";
import ConversationTimeline from "@/components/ConversationTimeline";
import ReplyForm from "@/components/ReplyForm";
import NoteForm from "@/components/NoteForm";
import TicketSummary from "@/components/TicketSummary";
import AuditTimeline from "@/components/AuditTimeline";
import CustomerHistory from "@/components/CustomerHistory";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Lock, ChevronDown, ChevronRight, Star } from "lucide-react";

const CSAT_LABELS: Record<number, string> = {
  1: "Very unhappy",
  2: "Unhappy",
  3: "Neutral",
  4: "Happy",
  5: "Very happy",
};

type ComposeMode = "reply" | "note";

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [composeMode, setComposeMode] = useState<ComposeMode>("reply");
  const [activityOpen, setActivityOpen] = useState(false);

  const { data: ticket, isLoading, error } = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => {
      const { data } = await axios.get<Ticket>(`/api/tickets/${id}`);
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <BackLink to="/tickets">Back to tickets</BackLink>

      {isLoading && <TicketDetailSkeleton />}

      {error && (
        <ErrorAlert
          message={
            axios.isAxiosError(error) && error.response?.status === 404
              ? "Ticket not found"
              : "Failed to load ticket"
          }
        />
      )}

      {ticket && (
        <div className="grid grid-cols-[1fr_auto] gap-6">
          <div className="space-y-6">
            <TicketDetail ticket={ticket} />

            <TicketSummary ticket={ticket} />

            {/* Unified conversation timeline: customer messages, agent replies, internal notes */}
            <div className="space-y-3">
              <h2 className="font-semibold">Conversation</h2>
              <ConversationTimeline ticket={ticket} />
            </div>

            {/* Audit trail — collapsible, collapsed by default */}
            {ticket.auditEvents && ticket.auditEvents.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setActivityOpen((o) => !o)}
                  className="flex items-center gap-1.5 text-sm font-semibold hover:text-foreground/70 transition-colors"
                >
                  {activityOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  Activity
                  <span className="text-xs font-normal text-muted-foreground">
                    ({ticket.auditEvents.length})
                  </span>
                </button>
                {activityOpen && (
                  <div className="mt-3">
                    <AuditTimeline events={ticket.auditEvents} />
                  </div>
                )}
              </div>
            )}

            {/* Compose area with Reply / Internal Note toggle */}
            <div className="space-y-3 pb-16">
              {/* Mode switcher */}
              <div className="flex items-center gap-1 border-b pb-3">
                <Button
                  type="button"
                  variant={composeMode === "reply" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => setComposeMode("reply")}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Reply to Sender
                </Button>
                <Button
                  type="button"
                  variant={composeMode === "note" ? "secondary" : "ghost"}
                  size="sm"
                  className={`h-8 gap-1.5 ${
                    composeMode === "note"
                      ? "bg-amber-500/10 text-amber-700 hover:bg-amber-500/15"
                      : ""
                  }`}
                  onClick={() => setComposeMode("note")}
                >
                  <Lock className="h-3.5 w-3.5" />
                  Internal Note
                </Button>
              </div>

              {composeMode === "reply" ? (
                <ReplyForm ticket={ticket} />
              ) : (
                <NoteForm ticketId={ticket.id} />
              )}
            </div>
          </div>

          <div className="space-y-4">
            <UpdateTicket ticket={ticket} />
            {ticket.csatRating && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-[13px] font-medium text-muted-foreground flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5" />
                    CSAT Rating
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={`h-4 w-4 ${
                          n <= ticket.csatRating!.rating
                            ? "fill-yellow-400 text-yellow-400"
                            : "fill-none text-muted-foreground/30"
                        }`}
                      />
                    ))}
                    <span className="text-xs text-muted-foreground ml-1">
                      {CSAT_LABELS[ticket.csatRating.rating] ?? ticket.csatRating.rating}
                    </span>
                  </div>
                  {ticket.csatRating.comment && (
                    <p className="text-xs text-muted-foreground italic leading-relaxed">
                      "{ticket.csatRating.comment}"
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(ticket.csatRating.submittedAt).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            )}
            {ticket.customer && (
              <CustomerHistory customer={ticket.customer} currentTicketId={ticket.id} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
