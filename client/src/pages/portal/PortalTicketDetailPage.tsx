import { useCallback, useRef, useState } from "react";
import { useParams } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  Skeleton, } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import ErrorAlert from "@/components/ErrorAlert";
import BackLink from "@/components/BackLink";
import CsatRatingWidget from "@/components/CsatRatingWidget";
import RichTextEditor from "@/components/RichTextEditor";
import RichTextRenderer from "@/components/RichTextRenderer";
import {
  Loader2, Paperclip, X, FileText, Image, File,
  Upload, CheckCircle2, AlertTriangle, Send, MessageSquare,
  Clock, RefreshCw, CircleDot,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Reply {
  id: number;
  body: string;
  bodyHtml: string | null;
  senderType: "agent" | "customer";
  createdAt: string;
}

interface CsatRating {
  rating: number;
  comment: string | null;
  submittedAt: string;
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
  csatRating: CsatRating | null;
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; classes: string; dot: string }> = {
  new:        { label: "Received",     classes: "bg-slate-100  text-slate-600  dark:bg-slate-800/60 dark:text-slate-400",  dot: "bg-slate-400" },
  processing: { label: "Under Review", classes: "bg-blue-50    text-blue-700   dark:bg-blue-900/40  dark:text-blue-400",   dot: "bg-blue-400" },
  open:       { label: "Open",         classes: "bg-amber-50   text-amber-700  dark:bg-amber-900/30 dark:text-amber-400",  dot: "bg-amber-400" },
  resolved:   { label: "Resolved",     classes: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", dot: "bg-emerald-500" },
  closed:     { label: "Closed",       classes: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/40" },
};

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.new!;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${cfg.classes}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function formatDT(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── File attachment helpers (same as PortalNewTicketPage) ──────────────────────

const ALLOWED_EXTS = ["pdf","doc","docx","xls","xlsx","png","jpg","jpeg","gif","webp","svg","zip","txt","csv"];
const MAX_SIZE_MB  = 10;
const MAX_FILES    = 5;

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png","jpg","jpeg","gif","webp","svg"].includes(ext)) return Image;
  if (["pdf","doc","docx","txt","csv"].includes(ext))        return FileText;
  return File;
}
function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

interface AttachedFile { id: string; file: File; error?: string }

function validateFile(f: File): string | undefined {
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTS.includes(ext)) return `File type .${ext} is not allowed`;
  if (f.size > MAX_SIZE_MB * 1048576) return `File exceeds ${MAX_SIZE_MB} MB`;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PortalTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  // Reply rich-text state
  const [bodyHtml, setBodyHtml]     = useState("");
  const [bodyText, setBodyText]     = useState("");
  const handleBodyChange = useCallback((html: string, text: string) => {
    setBodyHtml(html); setBodyText(text);
  }, []);

  // File attachment state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files,     setFiles]     = useState<AttachedFile[]>([]);
  const [dropOver,  setDropOver]  = useState(false);
  const [uploading, setUploading] = useState(false);

  function addFiles(incoming: FileList | File[]) {
    const list = Array.from(incoming);
    setFiles(prev => {
      const canAdd = MAX_FILES - prev.length;
      return [...prev, ...list.slice(0, canAdd).map(f => ({
        id: crypto.randomUUID(), file: f, error: validateFile(f),
      }))];
    });
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ["portal-ticket", id],
    queryFn: async () => {
      const { data } = await axios.get<{ ticket: PortalTicketDetail }>(`/api/portal/tickets/${id}`);
      return data.ticket;
    },
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      // 1. Post reply
      await axios.post(`/api/portal/tickets/${id}/replies`, {
        body: bodyText, bodyHtml,
      });
      // 2. Upload valid attachments in parallel (linked to ticket)
      const validFiles = files.filter(f => !f.error);
      if (validFiles.length > 0) {
        setUploading(true);
        await Promise.all(validFiles.map(({ file }) => {
          const fd = new FormData();
          fd.append("file", file);
          return axios.post(`/api/portal/tickets/${id}/attachments`, fd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        }));
        setUploading(false);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["portal-tickets"] });
      setBodyHtml(""); setBodyText(""); setFiles([]);
    },
    onError: () => setUploading(false),
  });

  const isClosed    = data?.status === "closed";
  const validFiles  = files.filter(f => !f.error);
  const canSend     = bodyText.trim().length > 0 && !replyMutation.isPending;

  return (
    <div className="space-y-6 max-w-[780px]">
      <BackLink to="/portal/tickets">Back to my tickets</BackLink>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      )}

      {error && (
        <ErrorAlert message={
          axios.isAxiosError(error) && error.response?.status === 404
            ? "Ticket not found" : "Failed to load ticket"
        } />
      )}

      {data && (
        <div className="space-y-6">

          {/* ── Header ── */}
          <div className="rounded-2xl border border-border/60 bg-background px-6 py-5 shadow-sm space-y-3">
            <div className="flex items-start gap-3 flex-wrap">
              <h1 className="text-xl font-bold flex-1 min-w-0 tracking-tight">{data.subject}</h1>
              <StatusPill status={data.status} />
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Submitted {formatDT(data.createdAt)}
              </span>
              {data.category && (
                <span className="border border-border/50 rounded px-2 py-0.5">{data.category}</span>
              )}
            </div>
          </div>

          {/* ── Conversation ── */}
          <div className="space-y-3">
            {/* Original message */}
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0 mt-0.5 border border-emerald-200 dark:border-emerald-800/40">
                <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                  {data.subject[0]?.toUpperCase()}
                </span>
              </div>
              <div className="flex-1 rounded-xl border border-border/60 bg-background px-4 py-3.5 shadow-sm">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-semibold text-foreground">You</span>
                  <span className="text-[11px] text-muted-foreground">{formatDT(data.createdAt)}</span>
                </div>
                {data.bodyHtml
                  ? <RichTextRenderer content={data.bodyHtml} />
                  : <p className="text-sm whitespace-pre-wrap text-foreground/90">{data.body}</p>}
              </div>
            </div>

            {/* Replies */}
            {data.replies.map((reply) => {
              const isAgent = reply.senderType === "agent";
              return (
                <div key={reply.id} className={`flex gap-3 ${isAgent ? "" : "flex-row-reverse"}`}>
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 border text-[11px] font-bold ${
                    isAgent
                      ? "bg-primary/10 border-primary/20 text-primary"
                      : "bg-emerald-100 dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400"
                  }`}>
                    {isAgent ? "S" : "Y"}
                  </div>
                  <div className={`flex-1 rounded-xl border px-4 py-3.5 shadow-sm ${
                    isAgent
                      ? "bg-primary/[0.04] border-primary/15"
                      : "bg-background border-border/60"
                  }`}>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-xs font-semibold text-foreground">
                        {isAgent ? "Support Team" : "You"}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{formatDT(reply.createdAt)}</span>
                    </div>
                    {reply.bodyHtml
                      ? <RichTextRenderer content={reply.bodyHtml} />
                      : <p className="text-sm whitespace-pre-wrap text-foreground/90">{reply.body}</p>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── CSAT ── */}
          {(data.status === "resolved" || data.status === "closed") && !data.csatRating && (
            <CsatRatingWidget ticketId={data.id} />
          )}
          {data.csatRating && (
            <div className="rounded-xl border bg-muted/30 px-4 py-3 flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your rating</p>
                <div className="flex items-center gap-1.5">
                  {[1,2,3,4,5].map(n => (
                    <span key={n} className={`text-base ${n <= data.csatRating!.rating ? "text-yellow-400" : "text-muted-foreground/30"}`}>★</span>
                  ))}
                  <span className="text-sm text-muted-foreground ml-1">{data.csatRating.rating}/5</span>
                </div>
                {data.csatRating.comment && (
                  <p className="text-xs text-muted-foreground italic">"{data.csatRating.comment}"</p>
                )}
              </div>
            </div>
          )}

          {/* ── Reply composer ── */}
          {!isClosed && (
            <div className="rounded-2xl border border-border/60 bg-background shadow-sm overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-muted/20">
                <MessageSquare className="h-4 w-4 text-muted-foreground/60" />
                <span className="text-sm font-semibold">Send a reply</span>
              </div>

              {/* Editor */}
              <div className="px-1">
                <RichTextEditor
                  content={bodyHtml}
                  onChange={handleBodyChange}
                  placeholder="Write your reply here…"
                  minHeight="120px"
                />
              </div>

              {/* Attachments */}
              {files.length > 0 && (
                <div className="px-4 pb-3 space-y-2">
                  {files.map(af => {
                    const Icon = fileIcon(af.file.name);
                    return (
                      <div key={af.id} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm ${
                        af.error ? "border-destructive/40 bg-destructive/5" : "border-border/50 bg-muted/30"
                      }`}>
                        <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${af.error ? "bg-destructive/10" : "bg-background border border-border/60"}`}>
                          <Icon className={`h-3.5 w-3.5 ${af.error ? "text-destructive" : "text-muted-foreground"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium truncate">{af.file.name}</p>
                          {af.error
                            ? <p className="text-[11px] text-destructive">{af.error}</p>
                            : <p className="text-[11px] text-muted-foreground">{fmtSize(af.file.size)}</p>}
                        </div>
                        <button type="button" onClick={() => setFiles(p => p.filter(f => f.id !== af.id))}
                          className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Drop zone (visible when hovering or when no files yet + user explicitly dropped) */}
              {dropOver && (
                <div
                  className="mx-4 mb-3 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-50/40 p-5 dark:bg-emerald-950/20"
                  onDragOver={e => { e.preventDefault(); setDropOver(true); }}
                  onDragLeave={() => setDropOver(false)}
                  onDrop={e => { e.preventDefault(); setDropOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
                >
                  <Upload className="h-5 w-5 text-emerald-600" />
                  <p className="text-xs font-medium text-emerald-700">Drop files here</p>
                </div>
              )}

              {/* Footer: attach + send */}
              <div
                className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border/50 bg-muted/10"
                onDragOver={e => { e.preventDefault(); setDropOver(true); }}
                onDragLeave={() => setDropOver(false)}
                onDrop={e => { e.preventDefault(); setDropOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={files.length >= MAX_FILES}
                    title="Attach files"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-muted/60"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    Attach
                    {files.length > 0 && (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold">
                        {files.length}
                      </span>
                    )}
                  </button>
                  <span className="text-[10px] text-muted-foreground/40">
                    {ALLOWED_EXTS.slice(0, 4).map(e => `.${e}`).join(", ")}…
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ALLOWED_EXTS.map(e => `.${e}`).join(",")}
                    className="hidden"
                    onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }}
                  />
                </div>

                <div className="flex items-center gap-2">
                  {replyMutation.error && (
                    <span className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" /> Failed to send
                    </span>
                  )}
                  {uploading && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Uploading files…
                    </span>
                  )}
                  <Button
                    size="sm"
                    disabled={!canSend}
                    onClick={() => replyMutation.mutate()}
                    className="gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white"
                    style={canSend ? { boxShadow: "0 2px 8px rgba(5,150,105,0.3)" } : undefined}
                  >
                    {replyMutation.isPending
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Sending…</>
                      : <><Send className="h-3.5 w-3.5" />Send reply{validFiles.length > 0 ? ` · ${validFiles.length} file${validFiles.length > 1 ? "s" : ""}` : ""}</>}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {isClosed && (
            <div className="rounded-xl border border-border/50 bg-muted/20 px-5 py-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground/40 shrink-0" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">This ticket is closed.</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  Need more help? <a href="/portal/new-ticket" className="text-emerald-700 dark:text-emerald-400 hover:underline underline-offset-4">Submit a new ticket</a>
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
