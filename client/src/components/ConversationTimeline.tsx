import { useState } from "react";
import RichTextRenderer from "@/components/RichTextRenderer";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { type Ticket } from "core/constants/ticket.ts";
import { type Note } from "core/constants/note.ts";
import { type SenderType } from "core/constants/sender-type.ts";
import { type IntakeChannel, CHANNEL_ICON, CHANNEL_SHORT_LABEL } from "core/constants/channel.ts";
import { type ReplyType, type QuoteData } from "@/components/ReplyForm";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorAlert from "@/components/ErrorAlert";
import {
  Reply as ReplyIcon,
  Forward,
  Lock,
  Pin,
  PinOff,
  Trash2,
  Paperclip,
  Download,
  ChevronDown,
  Users,
  Quote,
  Inbox,
} from "lucide-react";
import { useSession } from "@/lib/auth-client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AttachmentInfo {
  id: number;
  filename: string;
  size: number;
  mimeType: string;
}

interface Reply {
  id: number;
  body: string;
  bodyHtml: string | null;
  senderType: SenderType;
  channel: IntakeChannel | null;
  replyType: string | null;
  to: string | null;
  cc: string | null;
  bcc: string | null;
  forwardTo: string | null;
  quotedHtml: string | null;
  user: { id: string; name: string } | null;
  createdAt: string;
  attachments: AttachmentInfo[];
}

type TimelineItem =
  | { kind: "reply"; data: Reply }
  | { kind: "note"; data: Note };

interface ConversationTimelineProps {
  ticket: Ticket;
  /** Called when an agent clicks Reply / Reply All / Forward on a message. */
  onCompose?: (mode: ReplyType, quote?: QuoteData) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join("");
}

function parseAddresses(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return isToday
    ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface AvatarProps {
  name: string;
  colorClass: string;
}

function Avatar({ name, colorClass }: AvatarProps) {
  return (
    <div
      className={`h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 select-none ${colorClass}`}
    >
      {initials(name)}
    </div>
  );
}

function AttachmentList({
  ticketId,
  attachments,
}: {
  ticketId: number;
  attachments: AttachmentInfo[];
}) {
  if (!attachments.length) return null;
  return (
    <div className="mt-3 pt-3 border-t border-border/60 flex flex-wrap gap-2">
      {attachments.map((a) => (
        <a
          key={a.id}
          href={`/api/tickets/${ticketId}/attachments/${a.id}/download`}
          download={a.filename}
          className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1.5 text-xs hover:bg-muted transition-colors group/att"
        >
          <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="truncate max-w-[180px]" title={a.filename}>
            {a.filename}
          </span>
          <span className="text-muted-foreground/60 shrink-0">
            · {formatBytes(a.size)}
          </span>
          <Download className="h-3 w-3 text-muted-foreground shrink-0 opacity-0 group-hover/att:opacity-100 transition-opacity" />
        </a>
      ))}
    </div>
  );
}

// Collapsed mail trail shown at the bottom of a reply card
function StoredQuotedTrail({
  quotedHtml,
  isForward,
  ticket,
}: {
  quotedHtml: string;
  isForward: boolean;
  ticket: Ticket;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 pt-3 border-t border-border/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`
          inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
          border transition-all duration-200
          ${open
            ? "bg-muted text-foreground border-border shadow-sm"
            : "bg-transparent text-muted-foreground border-border/40 hover:bg-muted/60 hover:text-foreground hover:border-border"
          }
        `}
        title={open ? "Hide mail trail" : "Show mail trail"}
      >
        <Quote className="h-3 w-3" />
        <span className="tracking-[0.15em] font-bold leading-none opacity-60">···</span>
        {open ? "Hide" : "Show"} {isForward ? "forwarded message" : "quoted message"}
        <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-2.5 rounded-lg border border-border/60 bg-muted/20 overflow-hidden">
          {/* Thread header */}
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border/40">
            {isForward
              ? <Forward className="h-3 w-3 text-blue-500 shrink-0" />
              : <Quote className="h-3 w-3 text-muted-foreground shrink-0" />
            }
            <span className="text-[11px] text-muted-foreground italic">
              {isForward
                ? `Forwarded from ${ticket.senderName} <${ticket.senderEmail}>`
                : `Original message from ${ticket.senderName} <${ticket.senderEmail}>`
              }
            </span>
          </div>
          {/* Body */}
          <div className="px-4 py-3 max-h-56 overflow-y-auto text-sm opacity-75 border-l-[3px] border-muted-foreground/20 ml-3">
            <RichTextRenderer content={quotedHtml} />
          </div>
        </div>
      )}
    </div>
  );
}

// Recipients row shown under the sender name
function RecipientRow({
  reply,
  ticket,
}: {
  reply: Reply;
  ticket: Ticket;
}) {
  const [expanded, setExpanded] = useState(false);

  if (reply.senderType === "customer") {
    return (
      <p className="text-[11px] text-muted-foreground mt-0.5">
        From:{" "}
        <span className="text-foreground/70">{ticket.senderEmail}</span>
      </p>
    );
  }

  const toAddress =
    reply.replyType === "forward"
      ? (reply.forwardTo ?? "—")
      : (reply.to ?? ticket.senderEmail);

  const ccList = parseAddresses(reply.cc);
  const bccList = parseAddresses(reply.bcc);
  const hasMore = ccList.length > 0 || bccList.length > 0;
  const toLabel = reply.replyType === "forward" ? "Fwd to" : "To";

  return (
    <div className="mt-0.5 text-[11px] text-muted-foreground">
      <button
        type="button"
        className={`flex items-center gap-1 transition-colors ${
          hasMore ? "hover:text-foreground cursor-pointer" : "cursor-default"
        }`}
        onClick={() => hasMore && setExpanded((v) => !v)}
      >
        <span>
          {toLabel}:{" "}
          <span className="text-foreground/70">{toAddress}</span>
        </span>
        {hasMore && (
          <>
            <span className="text-muted-foreground/50">
              · {ccList.length + bccList.length} more
            </span>
            <ChevronDown
              className={`h-3 w-3 transition-transform duration-150 ${
                expanded ? "rotate-180" : ""
              }`}
            />
          </>
        )}
      </button>

      {expanded && (
        <div className="mt-1 space-y-0.5 pl-2 border-l-2 border-muted">
          {ccList.length > 0 && (
            <p>
              CC:{" "}
              <span className="text-foreground/70">{ccList.join(", ")}</span>
            </p>
          )}
          {bccList.length > 0 && (
            <p>
              BCC:{" "}
              <span className="text-foreground/70">{bccList.join(", ")}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Original message card ─────────────────────────────────────────────────────
// Renders the ticket's opening message as the first item in the conversation
// thread, styled like a customer reply but flagged "Original" so the flow
// reads as one continuous conversation.

function OriginalMessageCard({ ticket }: { ticket: Ticket }) {
  const card = {
    wrap:    "border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-900/30",
    stripe:  "bg-slate-400/60 dark:bg-slate-500/50",
    divider: "border-slate-200/80 dark:border-slate-700/40",
    avatar:  "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300",
    badge:   "border-slate-300/70 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
  };

  return (
    <div className={`group/card rounded-xl overflow-hidden transition-all duration-150 hover:shadow-md ${card.wrap} flex`}>
      {/* Left colour stripe */}
      <div className={`w-1 shrink-0 ${card.stripe}`} />

      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-start gap-3 px-4 py-3">
          <Avatar name={ticket.senderName} colorClass={card.avatar} />

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                <span className="text-sm font-semibold leading-tight truncate">
                  {ticket.senderName}
                </span>
                <span className={`inline-flex items-center rounded-full border px-2 py-0 text-[10px] font-semibold shrink-0 ${card.badge}`}>
                  Customer
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/[0.06] px-2 py-0 text-[10px] font-semibold text-primary shrink-0">
                  <Inbox className="h-2.5 w-2.5" />
                  Original
                </span>
                {ticket.source && (
                  <span className="inline-flex items-center gap-0.5 rounded-full border px-2 py-0 text-[10px] font-medium text-muted-foreground bg-background shrink-0 capitalize">
                    {ticket.source}
                  </span>
                )}
              </div>

              <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                {formatTime(ticket.createdAt)}
              </span>
            </div>

            {ticket.senderEmail && (
              <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                {ticket.senderEmail}
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className={`border-t mx-4 ${card.divider}`} />

        {/* Body */}
        <div className="px-4 py-3 pl-[52px]">
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <RichTextRenderer content={ticket.bodyHtml ?? ticket.body} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Reply card ────────────────────────────────────────────────────────────────

function ReplyCard({
  reply,
  ticket,
  onCompose,
}: {
  reply: Reply;
  ticket: Ticket;
  onCompose?: (mode: ReplyType, quote?: QuoteData) => void;
}) {
  const isAgent = reply.senderType === "agent";
  const displayName = isAgent
    ? (reply.user?.name ?? "Agent")
    : ticket.senderName;
  const isForward = reply.replyType === "forward";

  const thisAsQuote: QuoteData = {
    bodyHtml: reply.bodyHtml ?? `<p>${reply.body}</p>`,
    senderName: displayName,
    createdAt: reply.createdAt,
  };

  // ── Visual tokens per sender type ──────────────────────────────────────────
  const card = isAgent
    ? {
        wrap:    "border border-primary/20 bg-primary/[0.03] dark:bg-primary/[0.06]",
        stripe:  "bg-primary/50",
        divider: "border-primary/10",
        avatar:  "bg-primary/15 text-primary",
        badge:   "border-primary/20 bg-primary/8 text-primary/80",
        badgeTx: "Support",
      }
    : {
        wrap:    "border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-900/30",
        stripe:  "bg-slate-400/60 dark:bg-slate-500/50",
        divider: "border-slate-200/80 dark:border-slate-700/40",
        avatar:  "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300",
        badge:   "border-slate-300/70 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
        badgeTx: "Customer",
      };

  return (
    <div className={`group/card rounded-xl overflow-hidden transition-all duration-150 hover:shadow-md ${card.wrap} flex`}>
      {/* Left colour stripe */}
      <div className={`w-1 shrink-0 ${card.stripe}`} />

      <div className="flex-1 min-w-0">
        {/* ── Header ── */}
        <div className="flex items-start gap-3 px-4 py-3">
          <Avatar name={displayName} colorClass={card.avatar} />

          <div className="flex-1 min-w-0">
            {/* Name row */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                <span className="text-sm font-semibold leading-tight truncate">
                  {displayName}
                </span>

                {/* Sender-type badge */}
                <span className={`inline-flex items-center rounded-full border px-2 py-0 text-[10px] font-semibold shrink-0 ${card.badge}`}>
                  {card.badgeTx}
                </span>

                {/* Channel badge */}
                {reply.channel && (
                  <span className="inline-flex items-center gap-0.5 rounded-full border px-2 py-0 text-[10px] font-medium text-muted-foreground bg-background shrink-0">
                    <span>{CHANNEL_ICON[reply.channel]}</span>
                    <span>{CHANNEL_SHORT_LABEL[reply.channel]}</span>
                  </span>
                )}

                {/* Forward badge */}
                {isForward && (
                  <span className="inline-flex items-center gap-0.5 rounded-full border px-2 py-0 text-[10px] font-medium border-blue-200 text-blue-600 bg-blue-50/60 shrink-0">
                    <Forward className="h-2.5 w-2.5" />
                    Forwarded
                  </span>
                )}
              </div>

              {/* Timestamp + hover actions */}
              <div className="flex items-center gap-1 shrink-0">
                <div className="flex items-center opacity-0 group-hover/card:opacity-100 transition-opacity duration-150">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => onCompose?.("reply_all", thisAsQuote)}
                    title="Reply to All"
                  >
                    <ReplyIcon className="h-3.5 w-3.5" />
                    Reply
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => onCompose?.("reply_sender", thisAsQuote)}
                    title="Reply to Sender only"
                  >
                    <Users className="h-3.5 w-3.5" />
                    Sender
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => onCompose?.("forward", thisAsQuote)}
                    title="Forward"
                  >
                    <Forward className="h-3.5 w-3.5" />
                    Fwd
                  </Button>
                </div>

                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {formatTime(reply.createdAt)}
                </span>
              </div>
            </div>

            {/* Recipient row */}
            <RecipientRow reply={reply} ticket={ticket} />
          </div>
        </div>

        {/* ── Divider ── */}
        <div className={`border-t mx-4 ${card.divider}`} />

        {/* ── Body ── */}
        <div className="px-4 py-3 pl-[52px]">
          <RichTextRenderer content={reply.bodyHtml ?? reply.body} />
          <AttachmentList ticketId={ticket.id} attachments={reply.attachments} />
          {reply.quotedHtml && (
            <StoredQuotedTrail
              quotedHtml={reply.quotedHtml}
              isForward={reply.replyType === "forward"}
              ticket={ticket}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Note card ─────────────────────────────────────────────────────────────────

function NoteCard({
  note,
  ticketId,
  currentUserId,
  currentUserRole,
  onPin,
  onDelete,
}: {
  note: Note;
  ticketId: number;
  currentUserId?: string;
  currentUserRole?: string;
  onPin: (noteId: number, pinned: boolean) => void;
  onDelete: (noteId: number) => void;
}) {
  const isAuthor = note.authorId === currentUserId;
  const canDelete = isAuthor || currentUserRole === "admin";

  return (
    <div
      className={`group/note rounded-xl overflow-hidden transition-all duration-150 hover:shadow-sm ${
        note.isPinned
          ? "border-2 border-dashed border-amber-400/70 bg-amber-500/[0.04]"
          : "border-2 border-dashed border-amber-300/50 bg-amber-500/[0.02]"
      }`}
    >
      {/* Header */}
      <div className="flex items-start gap-3 px-4 py-3">
        <Avatar
          name={note.author.name}
          colorClass="bg-amber-500/15 text-amber-700"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="text-sm font-semibold">{note.author.name}</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/60 px-2 py-0 text-[10px] font-semibold text-amber-700 bg-amber-500/10 shrink-0">
                <Lock className="h-2.5 w-2.5" />
                Internal Note
              </span>
              {note.isPinned && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/60 px-2 py-0 text-[10px] font-semibold text-amber-700 bg-amber-400/15 shrink-0">
                  <Pin className="h-2.5 w-2.5" />
                  Pinned
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-0.5 shrink-0">
              <span className="text-[11px] text-muted-foreground tabular-nums mr-1">
                {formatTime(note.createdAt)}
                {note.updatedAt !== note.createdAt && (
                  <span className="italic"> · edited</span>
                )}
              </span>
              <div className="opacity-0 group-hover/note:opacity-100 transition-opacity flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-amber-600"
                  title={note.isPinned ? "Unpin" : "Pin"}
                  onClick={() => onPin(note.id, !note.isPinned)}
                >
                  {note.isPinned ? (
                    <PinOff className="h-3.5 w-3.5" />
                  ) : (
                    <Pin className="h-3.5 w-3.5" />
                  )}
                </Button>
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    title="Delete note"
                    onClick={() => onDelete(note.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-amber-200/50 mx-4" />

      {/* Body */}
      <div className="px-4 py-3 pl-[52px]">
        <RichTextRenderer content={note.bodyHtml ?? note.body} />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ConversationTimeline({
  ticket,
  onCompose,
}: ConversationTimelineProps) {
  const { id: ticketId } = ticket;
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const currentUserRole = session?.user?.role;

  const repliesQuery = useQuery({
    queryKey: ["replies", ticketId],
    queryFn: async () => {
      const { data } = await axios.get<{ replies: Reply[] }>(
        `/api/tickets/${ticketId}/replies`
      );
      return data.replies;
    },
  });

  const notesQuery = useQuery({
    queryKey: ["notes", ticketId],
    queryFn: async () => {
      const { data } = await axios.get<{ notes: Note[] }>(
        `/api/tickets/${ticketId}/notes`
      );
      return data.notes;
    },
  });

  const pinMutation = useMutation({
    mutationFn: async ({
      noteId,
      isPinned,
    }: {
      noteId: number;
      isPinned: boolean;
    }) => {
      await axios.patch(`/api/tickets/${ticketId}/notes/${noteId}`, {
        isPinned,
      });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notes", ticketId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (noteId: number) => {
      await axios.delete(`/api/tickets/${ticketId}/notes/${noteId}`);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notes", ticketId] }),
  });

  if (repliesQuery.isLoading || notesQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    );
  }

  if (repliesQuery.error || notesQuery.error) {
    return <ErrorAlert message="Failed to load conversation" />;
  }

  const replies = repliesQuery.data ?? [];
  const notes = notesQuery.data ?? [];

  const pinnedNotes: TimelineItem[] = notes
    .filter((n) => n.isPinned)
    .map((n) => ({ kind: "note" as const, data: n }));

  const unpinnedItems: TimelineItem[] = [
    ...replies.map((r): TimelineItem => ({ kind: "reply", data: r })),
    ...notes
      .filter((n) => !n.isPinned)
      .map((n): TimelineItem => ({ kind: "note", data: n })),
  ].sort(
    (a, b) =>
      new Date(a.data.createdAt).getTime() -
      new Date(b.data.createdAt).getTime()
  );

  const timeline = [...pinnedNotes, ...unpinnedItems];

  return (
    <div className="relative">
      {/* Vertical thread guide — connects every card down the left edge */}
      <div className="pointer-events-none absolute left-[19px] top-8 bottom-8 w-px bg-gradient-to-b from-border/60 via-border/40 to-transparent" aria-hidden />

      <div className="relative space-y-3">
        <OriginalMessageCard ticket={ticket} />

        {timeline.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 px-4 py-3 text-center">
            <p className="text-xs text-muted-foreground">
              No replies or notes yet — start the conversation below.
            </p>
          </div>
        ) : (
          timeline.map((item) => {
            if (item.kind === "reply") {
              return (
                <ReplyCard
                  key={`reply-${item.data.id}`}
                  reply={item.data}
                  ticket={ticket}
                  onCompose={onCompose}
                />
              );
            }

            return (
              <NoteCard
                key={`note-${item.data.id}`}
                note={item.data}
                ticketId={ticketId}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                onPin={(id, pinned) =>
                  pinMutation.mutate({ noteId: id, isPinned: pinned })
                }
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
