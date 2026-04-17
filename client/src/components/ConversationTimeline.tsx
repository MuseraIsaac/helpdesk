import RichTextRenderer from "@/components/RichTextRenderer";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { type Ticket } from "core/constants/ticket.ts";
import { type Note } from "core/constants/note.ts";
import { type SenderType, senderTypeLabel } from "core/constants/sender-type.ts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorAlert from "@/components/ErrorAlert";
import { Bot, User, Lock, Pin, PinOff, Trash2, Paperclip, Download } from "lucide-react";
import { useSession } from "@/lib/auth-client";

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
  user: { id: string; name: string } | null;
  createdAt: string;
  attachments: AttachmentInfo[];
}

type TimelineItem =
  | { kind: "reply"; data: Reply }
  | { kind: "note"; data: Note };

interface ConversationTimelineProps {
  ticket: Ticket;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentList({ ticketId, attachments }: { ticketId: number; attachments: AttachmentInfo[] }) {
  if (!attachments.length) return null;
  return (
    <div className="mt-3 pt-3 border-t flex flex-wrap gap-2">
      {attachments.map((a) => (
        <a
          key={a.id}
          href={`/api/tickets/${ticketId}/attachments/${a.id}/download`}
          download={a.filename}
          className="inline-flex items-center gap-1.5 rounded-md border bg-muted/50 px-2.5 py-1.5 text-xs hover:bg-muted transition-colors"
        >
          <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="truncate max-w-[160px]" title={a.filename}>{a.filename}</span>
          <span className="text-muted-foreground shrink-0">({formatBytes(a.size)})</span>
          <Download className="h-3 w-3 text-muted-foreground shrink-0" />
        </a>
      ))}
    </div>
  );
}

export default function ConversationTimeline({ ticket }: ConversationTimelineProps) {
  const { id: ticketId, senderName } = ticket;
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
    mutationFn: async ({ noteId, isPinned }: { noteId: number; isPinned: boolean }) => {
      await axios.patch(`/api/tickets/${ticketId}/notes/${noteId}`, { isPinned });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes", ticketId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (noteId: number) => {
      await axios.delete(`/api/tickets/${ticketId}/notes/${noteId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes", ticketId] }),
  });

  const isLoading = repliesQuery.isLoading || notesQuery.isLoading;
  const error = repliesQuery.error || notesQuery.error;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return <ErrorAlert message="Failed to load conversation" />;
  }

  // Pinned notes always float to the top regardless of timestamp.
  // Unpinned replies and notes are merged and sorted chronologically.
  const replies = repliesQuery.data ?? [];
  const notes = notesQuery.data ?? [];

  const pinnedNotes: TimelineItem[] = notes
    .filter((n) => n.isPinned)
    .map((n) => ({ kind: "note" as const, data: n }));

  const unpinnedItems: TimelineItem[] = [
    ...replies.map((r): TimelineItem => ({ kind: "reply", data: r })),
    ...notes.filter((n) => !n.isPinned).map((n): TimelineItem => ({ kind: "note", data: n })),
  ].sort(
    (a, b) => new Date(a.data.createdAt).getTime() - new Date(b.data.createdAt).getTime()
  );

  const timeline = [...pinnedNotes, ...unpinnedItems];

  if (timeline.length === 0) {
    return <p className="text-sm text-muted-foreground">No replies or notes yet.</p>;
  }

  return (
    <div className="space-y-3">
      {timeline.map((item) => {
        if (item.kind === "reply") {
          const reply = item.data;
          const isAgent = reply.senderType === "agent";
          const displayName = isAgent ? reply.user?.name ?? "Agent" : senderName;

          return (
            <Card key={`reply-${reply.id}`} className={isAgent ? "border-primary/25" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`h-6 w-6 rounded-md flex items-center justify-center ${
                      isAgent
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isAgent ? (
                      <Bot className="h-3.5 w-3.5" />
                    ) : (
                      <User className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div>
                    <CardTitle className="text-sm font-medium">{displayName}</CardTitle>
                    <CardDescription className="text-xs">
                      {senderTypeLabel[reply.senderType]} &middot;{" "}
                      {new Date(reply.createdAt).toLocaleString()}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <RichTextRenderer content={reply.bodyHtml ?? reply.body} />
                <AttachmentList ticketId={ticketId} attachments={reply.attachments} />
              </CardContent>
            </Card>
          );
        }

        // Internal note — amber-tinted, dashed border, lock icon
        const note = item.data;
        const isAuthor = note.authorId === currentUserId;
        const canDelete = isAuthor || currentUserRole === "admin";

        return (
          <div
            key={`note-${note.id}`}
            className={`rounded-lg border-2 border-dashed p-4 ${
              note.isPinned
                ? "border-amber-400 bg-amber-500/8"
                : "border-amber-300/60 bg-amber-500/5"
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-6 w-6 shrink-0 rounded-md flex items-center justify-center bg-amber-500/15 text-amber-600">
                  <Lock className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">{note.author.name}</span>
                    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-500/15 text-amber-700">
                      <Lock className="h-2.5 w-2.5" />
                      Internal Note
                    </span>
                    {note.isPinned && (
                      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-400/20 text-amber-700">
                        <Pin className="h-2.5 w-2.5" />
                        Pinned
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(note.createdAt).toLocaleString()}
                    {note.updatedAt !== note.createdAt && " · edited"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-amber-600"
                  title={note.isPinned ? "Unpin note" : "Pin note"}
                  disabled={pinMutation.isPending}
                  onClick={() =>
                    pinMutation.mutate({ noteId: note.id, isPinned: !note.isPinned })
                  }
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
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(note.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            <RichTextRenderer content={note.bodyHtml ?? note.body} />
          </div>
        );
      })}
    </div>
  );
}
