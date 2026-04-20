import { useState, useRef, useCallback } from "react";
import { useParams, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { type Ticket } from "core/constants/ticket.ts";
import ErrorAlert from "@/components/ErrorAlert";
import BackLink from "@/components/BackLink";
import TicketDetailSkeleton from "@/components/TicketDetailSkeleton";
import TicketDetail from "@/components/TicketDetail";
import UpdateTicket from "@/components/UpdateTicket";
import ConversationTimeline from "@/components/ConversationTimeline";
import ReplyForm, { type ReplyType, type QuoteData } from "@/components/ReplyForm";
import NoteForm from "@/components/NoteForm";
import TicketSummary from "@/components/TicketSummary";
import AuditTimeline from "@/components/AuditTimeline";
import CustomerHistory from "@/components/CustomerHistory";
import RunScenarioButton from "@/components/RunScenarioButton";
import PresenceIndicator from "@/components/PresenceIndicator";
import SaveAsTemplateDialog from "@/components/SaveAsTemplateDialog";
import MergeTicketDialog from "@/components/MergeTicketDialog";
import StatusBadge from "@/components/StatusBadge";
import TicketTypeBadge from "@/components/TicketTypeBadge";
import { EscalationBadge } from "@/components/EscalationBadge";
import { PriorityBadge } from "@/components/TriageBadge";
import { SlaBadge } from "@/components/SlaBadge";
import { useSettings } from "@/hooks/useSettings";
import { usePresence } from "@/hooks/usePresence";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare, Lock, ChevronDown, ChevronRight, Star, Link2,
  X, Forward, BookmarkPlus, Activity, Ticket as TicketIcon, UserCircle, Calendar,
  Bell, BellOff, Merge, GitMerge,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

const CSAT_LABELS: Record<number, string> = {
  1: "Very unhappy", 2: "Unhappy", 3: "Neutral", 4: "Happy", 5: "Very happy",
};

function formatTs(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(iso));
}

type ComposeMode = ReplyType | "note" | null;

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({
  icon: Icon, title, children, noPad = false,
}: {
  icon?: React.ElementType; title: string; children: React.ReactNode; noPad?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/50 bg-muted/20">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">{title}</span>
      </div>
      <div className={noPad ? "" : "p-4"}>{children}</div>
    </div>
  );
}

// ── Linked record panel ───────────────────────────────────────────────────────

function LinkedPanel({
  icon: Icon, title, to, number, description, badges,
}: {
  icon: React.ElementType; title: string; to: string;
  number: string; description: string; badges: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/50 bg-muted/20">
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">{title}</span>
      </div>
      <div className="p-4 space-y-2.5">
        <Link to={to} className="font-mono text-xs font-semibold text-primary hover:underline">
          {number}
        </Link>
        <p className="text-sm text-muted-foreground leading-snug line-clamp-2">{description}</p>
        <div className="flex flex-wrap gap-1.5">{badges}</div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const { data: ticketSettings } = useSettings("tickets");
  const defaultReplyMode: ReplyType = ticketSettings?.replyDefaultMode ?? "reply_all";
  const presenceEnabled = ticketSettings?.presenceEnabled ?? true;
  const mergeEnabled = ticketSettings?.mergeTicketsEnabled ?? true;

  const [composeMode, setComposeMode] = useState<ComposeMode>(null);
  const [quoteData, setQuoteData] = useState<QuoteData | null>(null);
  const [templateDialog, setTemplateDialog] = useState(false);
  const [mergeDialog, setMergeDialog] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const composeRef = useRef<HTMLDivElement>(null);

  const openCompose = useCallback((mode: ComposeMode, quote?: QuoteData) => {
    setComposeMode(mode);
    setQuoteData(quote ?? null);
    setTimeout(() => composeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  }, []);

  const { data: ticket, isLoading, error } = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => {
      const { data } = await axios.get<Ticket>(`/api/tickets/${id}`);
      return data;
    },
  });

  const ticketIdNum = ticket?.id ?? 0;
  const composing = composeMode !== null;
  const viewers = usePresence(ticketIdNum, presenceEnabled && ticketIdNum > 0, composing);

  // ── Follow state ──────────────────────────────────────────────────────────
  const queryClient = useQueryClient();
  const { data: followStatus, refetch: refetchFollow } = useQuery({
    queryKey: ["ticket-follow", id],
    queryFn: async () => {
      const { data } = await axios.get<{ following: boolean }>(
        `/api/tickets/${id}/followers/me`
      );
      return data;
    },
    enabled: !!id,
  });
  const following = followStatus?.following ?? false;

  const toggleFollow = useMutation({
    mutationFn: async () => {
      if (following) {
        await axios.delete(`/api/tickets/${id}/followers`);
      } else {
        await axios.post(`/api/tickets/${id}/followers`);
      }
    },
    onSuccess: () => refetchFollow(),
  });

  if (isLoading) {
    return (
      <div className="space-y-4 p-2">
        <TicketDetailSkeleton />
      </div>
    );
  }

  if (error || (!isLoading && !ticket)) {
    return (
      <div className="p-6">
        <ErrorAlert
          message={
            axios.isAxiosError(error) && error.response?.status === 404
              ? "Ticket not found"
              : "Failed to load ticket"
          }
        />
      </div>
    );
  }

  if (!ticket) return null;

  return (
    <div className="flex flex-col min-h-full bg-muted/20">

      {/* ── Sticky Header ── */}
      <div className="border-b bg-background shadow-sm">
        <div className="px-6 pt-3 pb-0">
          <BackLink to="/tickets">Back to Tickets</BackLink>
        </div>

        <div className="px-6 py-4">
          {/* Top row: number chip + actions */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-muted-foreground">
                <TicketIcon className="h-3 w-3" />
                {ticket.ticketNumber}
              </span>
              {ticket.ticketType && (
                <TicketTypeBadge type={ticket.ticketType} customType={ticket.customTicketType} />
              )}
              {ticket.isEscalated && (
                <EscalationBadge reason={ticket.escalationReason} />
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {presenceEnabled && session?.user && (
                <PresenceIndicator viewers={viewers} currentUserId={session.user.id} />
              )}

              {/* Follow / Unfollow */}
              <Button
                type="button"
                variant={following ? "default" : "outline"}
                size="sm"
                className={[
                  "gap-1.5 h-8 transition-all",
                  following
                    ? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20 hover:border-primary/50 shadow-none"
                    : "",
                ].join(" ")}
                disabled={toggleFollow.isPending}
                onClick={() => toggleFollow.mutate()}
                title={following ? "Unfollow this ticket" : "Follow this ticket"}
              >
                {following ? (
                  <>
                    <BellOff className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Following</span>
                  </>
                ) : (
                  <>
                    <Bell className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Follow</span>
                  </>
                )}
              </Button>

              {mergeEnabled && !ticket.mergedIntoId && (
                <Button type="button" variant="outline" size="sm" className="gap-1.5 h-8"
                  onClick={() => setMergeDialog(true)}>
                  <Merge className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Merge</span>
                </Button>
              )}

              <Button type="button" variant="outline" size="sm" className="gap-1.5 h-8"
                onClick={() => setTemplateDialog(true)}>
                <BookmarkPlus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Template</span>
              </Button>
              <RunScenarioButton ticketId={ticket.id} variant="header" />
            </div>
          </div>

          {/* Subject */}
          <h1 className="mt-2 text-xl font-semibold leading-snug">{ticket.subject}</h1>

          {/* Status + key metadata chips */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <StatusBadge status={ticket.status} customStatus={ticket.customStatus} />
            {ticket.priority && <PriorityBadge priority={ticket.priority} />}
            {ticket.slaStatus && ticket.slaStatus !== "completed" && (
              <SlaBadge status={ticket.slaStatus} />
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground bg-muted/30">
              <UserCircle className="h-3 w-3" />
              {ticket.senderName}
              {ticket.senderEmail && (
                <span className="opacity-60">· {ticket.senderEmail}</span>
              )}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground bg-muted/30">
              <Calendar className="h-3 w-3" />
              {formatTs(ticket.createdAt)}
            </span>
            {ticket.assignedTo && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground bg-muted/30">
                <span className="h-3.5 w-3.5 rounded-full bg-primary/15 flex items-center justify-center text-[8px] font-bold text-primary">
                  {ticket.assignedTo.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                </span>
                {ticket.assignedTo.name}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 px-6 py-5">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">

          {/* ── Main column ── */}
          <div className="space-y-4 min-w-0">

            {/* Merged-into banner */}
            {ticket.mergedIntoId && ticket.mergedInto && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10 px-4 py-3 flex items-start gap-3">
                <GitMerge className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800 dark:text-amber-300">This ticket has been merged</p>
                  <p className="text-amber-700/80 dark:text-amber-400/70 mt-0.5 text-xs">
                    All activity is now tracked under{" "}
                    <Link
                      to={`/tickets/${ticket.mergedIntoId}`}
                      className="font-semibold underline underline-offset-2 hover:opacity-80"
                    >
                      {ticket.mergedInto.ticketNumber}
                    </Link>
                    {" "}— {ticket.mergedInto.subject}
                  </p>
                </div>
              </div>
            )}

            {/* Triage / SLA / Escalation / Body */}
            <TicketDetail ticket={ticket} />

            {/* AI Summarize */}
            <TicketSummary ticket={ticket} />

            {/* Conversation */}
            <SectionCard icon={MessageSquare} title="Conversation" noPad>
              <div className="p-4">
                <ConversationTimeline
                  ticket={ticket}
                  onCompose={(mode, quote) => openCompose(mode, quote)}
                />
              </div>
            </SectionCard>

            {/* Activity trail — collapsible */}
            {ticket.auditEvents && ticket.auditEvents.length > 0 && (
              <SectionCard icon={Activity} title="Activity">
                <div>
                  <button
                    type="button"
                    onClick={() => setActivityOpen((o) => !o)}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
                  >
                    {activityOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    <span>{activityOpen ? "Hide" : "Show"} {ticket.auditEvents.length} event{ticket.auditEvents.length !== 1 ? "s" : ""}</span>
                  </button>
                  {activityOpen && (
                    <div className="mt-3 pt-3 border-t border-border/40">
                      <AuditTimeline events={ticket.auditEvents} />
                    </div>
                  )}
                </div>
              </SectionCard>
            )}

            {/* Compose area */}
            <div className="pb-16" ref={composeRef}>
              {composeMode === null ? (
                <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl border border-dashed border-border/60 bg-muted/20">
                  <span className="text-xs text-muted-foreground mr-1 select-none">Compose:</span>
                  <Button type="button" size="sm" className="gap-1.5 h-8 shadow-sm"
                    onClick={() => openCompose(defaultReplyMode)}>
                    <MessageSquare className="h-3.5 w-3.5" />
                    {defaultReplyMode === "reply_all" ? "Reply to All" : "Reply to Sender"}
                  </Button>
                  {defaultReplyMode === "reply_all" && (
                    <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5"
                      onClick={() => openCompose("reply_sender")}>
                      <MessageSquare className="h-3.5 w-3.5" />
                      Reply to Sender
                    </Button>
                  )}
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5"
                    onClick={() => openCompose("forward")}>
                    <Forward className="h-3.5 w-3.5" />
                    Forward
                  </Button>
                  <div className="h-4 w-px bg-border mx-0.5" />
                  <Button type="button" variant="outline" size="sm"
                    className="h-8 gap-1.5 border-amber-300/70 text-amber-700 hover:bg-amber-500/10 hover:text-amber-800 hover:border-amber-400"
                    onClick={() => openCompose("note")}>
                    <Lock className="h-3.5 w-3.5" />
                    Internal Note
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Tab strip */}
                  <div className="flex items-center gap-0.5 bg-muted/40 rounded-lg p-1 border border-border/50">
                    {(
                      [
                        { mode: "reply_all",    icon: MessageSquare, label: "Reply to All" },
                        { mode: "reply_sender", icon: MessageSquare, label: "Reply to Sender" },
                        { mode: "forward",      icon: Forward,       label: "Forward" },
                      ] as const
                    ).map(({ mode, icon: Icon, label }) => (
                      <button key={mode} type="button" onClick={() => setComposeMode(mode)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150 ${
                          composeMode === mode
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                        }`}>
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    ))}

                    <div className="flex-1" />

                    <button type="button" onClick={() => setComposeMode("note")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150 ${
                        composeMode === "note"
                          ? "bg-amber-500/15 text-amber-700 shadow-sm"
                          : "text-muted-foreground hover:text-amber-700 hover:bg-amber-500/10"
                      }`}>
                      <Lock className="h-3.5 w-3.5" />
                      Internal Note
                    </button>

                    <button type="button" onClick={() => { setComposeMode(null); setQuoteData(null); }}
                      title="Discard"
                      className="ml-1 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {composeMode === "note" ? (
                    <NoteForm ticketId={ticket.id} onSent={() => { setComposeMode(null); setQuoteData(null); }} />
                  ) : (
                    <ReplyForm
                      ticket={ticket}
                      replyType={composeMode}
                      quote={quoteData}
                      onSent={() => { setComposeMode(null); setQuoteData(null); }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Sidebar ── */}
          <div className="space-y-3">

            {/* Update panel (status / triage / routing) */}
            <UpdateTicket ticket={ticket} />

            {/* Linked Incident */}
            {ticket.linkedIncident && (
              <LinkedPanel
                icon={Link2}
                title="Linked Incident"
                to={`/incidents/${ticket.linkedIncident.id}`}
                number={ticket.linkedIncident.incidentNumber}
                description={ticket.linkedIncident.title}
                badges={
                  <>
                    <Badge variant="outline" className="text-[10px]">
                      {ticket.linkedIncident.status.replace(/_/g, " ")}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {ticket.linkedIncident.priority.toUpperCase()}
                    </Badge>
                    {ticket.linkedIncident.isMajor && (
                      <Badge variant="destructive" className="text-[10px]">Major</Badge>
                    )}
                  </>
                }
              />
            )}

            {/* Linked Service Request */}
            {ticket.linkedServiceRequest && (
              <LinkedPanel
                icon={Link2}
                title="Linked Request"
                to={`/requests/${ticket.linkedServiceRequest.id}`}
                number={ticket.linkedServiceRequest.requestNumber}
                description={ticket.linkedServiceRequest.title}
                badges={
                  <>
                    <Badge variant="outline" className="text-[10px]">
                      {ticket.linkedServiceRequest.status.replace(/_/g, " ")}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {ticket.linkedServiceRequest.priority}
                    </Badge>
                  </>
                }
              />
            )}

            {/* CSAT */}
            {ticket.csatRating && (
              <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/50 bg-muted/20">
                  <Star className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">CSAT Rating</span>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={`h-4 w-4 ${
                        n <= ticket.csatRating!.rating
                          ? "fill-yellow-400 text-yellow-400"
                          : "fill-none text-muted-foreground/25"
                      }`} />
                    ))}
                    <span className="text-xs text-muted-foreground ml-1 font-medium">
                      {CSAT_LABELS[ticket.csatRating.rating] ?? ticket.csatRating.rating}
                    </span>
                  </div>
                  {ticket.csatRating.comment && (
                    <p className="text-xs text-muted-foreground italic leading-relaxed border-l-2 border-border/60 pl-3">
                      "{ticket.csatRating.comment}"
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground/60">
                    {new Date(ticket.csatRating.submittedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                  </p>
                </div>
              </div>
            )}

            {/* Merged tickets (children merged into this one) */}
            {ticket.mergedTickets && ticket.mergedTickets.length > 0 && (
              <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/50 bg-muted/20">
                  <GitMerge className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                    Merged Tickets ({ticket.mergedTickets.length})
                  </span>
                </div>
                <div className="p-3 space-y-1.5">
                  {ticket.mergedTickets.map((m) => (
                    <Link
                      key={m.id}
                      to={`/tickets/${m.id}`}
                      className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 hover:bg-muted/50 transition-colors group"
                    >
                      <GitMerge className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] font-semibold text-primary group-hover:underline">
                          {m.ticketNumber}
                        </p>
                        <p className="text-xs text-muted-foreground truncate leading-snug">{m.subject}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Customer history */}
            {ticket.customer && (
              <CustomerHistory customer={ticket.customer} currentTicketId={ticket.id} />
            )}
          </div>
        </div>
      </div>

      {/* Merge dialog */}
      {mergeEnabled && (
        <MergeTicketDialog
          open={mergeDialog}
          onOpenChange={setMergeDialog}
          sourceIds={[ticket.id]}
          sourceLabel={ticket.ticketNumber}
          onMerged={() => {
            // The query invalidation in the dialog covers the refetch
          }}
        />
      )}

      {/* Template dialog */}
      <SaveAsTemplateDialog
        open={templateDialog}
        onOpenChange={setTemplateDialog}
        type="ticket"
        defaultTitle={ticket.subject}
        defaultBody={ticket.body}
      />
    </div>
  );
}
