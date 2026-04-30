import { useRef, useState, useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { type Ticket } from "core/constants/ticket.ts";
import { Button } from "@/components/ui/button";
import ErrorAlert from "@/components/ErrorAlert";
import MacroPicker from "@/components/MacroPicker";
import SaveMacroDialog from "@/components/SaveMacroDialog";
import RichTextEditor, { type RichTextEditorHandle } from "@/components/RichTextEditor";
import EmailChipsInput from "@/components/EmailChipsInput";
import { useSession } from "@/lib/auth-client";
import { useMe } from "@/hooks/useMe";
import { useSettings } from "@/hooks/useSettings";
import { BookOpen, BookmarkPlus, Paperclip, X, ChevronDown, Send, Sparkles, Quote } from "lucide-react";

export type ReplyType = "reply_all" | "reply_sender" | "forward";

export interface QuoteData {
  bodyHtml: string;
  senderName: string;
  createdAt: string;
}

interface StagedFile {
  id: number;
  filename: string;
  size: number;
  mimeType: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Quoted trail ──────────────────────────────────────────────────────────────

function QuotedTrail({
  quote,
  replyType,
  value,
  onChange,
  onReset,
  disabled,
}: {
  quote: QuoteData;
  replyType: ReplyType;
  value: string;
  onChange: (html: string) => void;
  onReset: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isEdited = value !== quote.bodyHtml;

  const headerLine = replyType === "forward"
    ? `Forwarded message from ${quote.senderName}`
    : `On ${new Date(quote.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}, ${quote.senderName} wrote`;

  return (
    <div className="mx-4 mb-1">
      {/* Toggle pill */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`
          inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
          border transition-all duration-150
          ${open
            ? "bg-muted text-foreground border-border"
            : "bg-transparent text-muted-foreground border-border/50 hover:bg-muted/60 hover:text-foreground hover:border-border"
          }
        `}
        title={open ? "Hide quoted message" : "Show quoted message"}
      >
        <Quote className="h-3 w-3" />
        {open ? "Hide" : "Show"} quoted message
        {isEdited && (
          <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 ml-0.5">
            · edited
          </span>
        )}
        <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Expanded content — editable */}
      {open && (
        <div className="mt-2 rounded-lg border border-border/60 overflow-hidden">
          {/* Header bar */}
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border/40">
            <Quote className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-[11px] text-muted-foreground italic truncate flex-1">
              {headerLine}
            </span>
            {isEdited && (
              <button
                type="button"
                onClick={onReset}
                disabled={disabled}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
                title="Reset to original quoted text"
              >
                Reset
              </button>
            )}
          </div>
          {/* Editable body — quote-styled left rail, dimmed to read as a quote */}
          <div className="border-l-2 border-muted-foreground/20 bg-muted/10 max-h-64 overflow-y-auto">
            <RichTextEditor
              content={value}
              onChange={(html) => onChange(html)}
              disabled={disabled}
              minHeight="80px"
              className="border-0 shadow-none rounded-none bg-transparent"
              editorClassName="text-sm opacity-80"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

interface ReplyFormProps {
  ticket: Ticket;
  replyType: ReplyType;
  quote?: QuoteData | null;
  onSent?: () => void;
}

export default function ReplyForm({ ticket, replyType, quote, onSent }: ReplyFormProps) {
  const ticketId = ticket.id;
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { data: meData } = useMe();
  const { data: ticketSettings } = useSettings("tickets");

  const [macroPickerOpen, setMacroPickerOpen] = useState(false);
  const [saveMacroOpen, setSaveMacroOpen] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<RichTextEditorHandle>(null);

  // Addressing — chip-based recipient lists. The "To" row pre-seeds with the
  // ticket's original sender for replies, and starts empty for forwards.
  //
  // Each chip array is mirrored into a ref. The chip input commits its draft
  // on `blur`, which fires *before* the Send button's `click` handler. By the
  // time React re-renders with the new state, the mutation has already read
  // the old `toChips` closure. Updating the ref inside the wrapped setter
  // means handleSendClick / replyMutation can read the freshly-committed
  // value synchronously.
  const [toChips,  setToChipsState]  = useState<string[]>(
    replyType === "forward" ? [] : [ticket.senderEmail],
  );
  const [ccChips,  setCcChipsState]  = useState<string[]>([]);
  const [bccChips, setBccChipsState] = useState<string[]>([]);
  const [showCcBcc, setShowCcBcc] = useState(false);

  const toChipsRef  = useRef<string[]>(toChips);
  const ccChipsRef  = useRef<string[]>(ccChips);
  const bccChipsRef = useRef<string[]>(bccChips);

  const setToChips = useCallback((next: string[]) => {
    toChipsRef.current = next;
    setToChipsState(next);
  }, []);
  const setCcChips = useCallback((next: string[]) => {
    ccChipsRef.current = next;
    setCcChipsState(next);
  }, []);
  const setBccChips = useCallback((next: string[]) => {
    bccChipsRef.current = next;
    setBccChipsState(next);
  }, []);

  // Reset "To" only when the agent crosses the forward / non-forward boundary.
  // Toggling between reply_all and reply_sender keeps the chips intact, so the
  // agent's edits aren't wiped by an incidental tab click.
  const prevReplyTypeRef = useRef(replyType);
  useEffect(() => {
    const wasForward = prevReplyTypeRef.current === "forward";
    const isForward  = replyType === "forward";
    if (wasForward !== isForward) {
      setToChips(isForward ? [] : [ticket.senderEmail]);
    }
    prevReplyTypeRef.current = replyType;
  }, [replyType, ticket.senderEmail, setToChips]);

  // Rich-text state
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [editorContent, setEditorContent] = useState("");

  // Editable quoted-message buffer — initialised from the parent-supplied
  // QuoteData and reset whenever the quote source changes (e.g. user picks a
  // different message via the conversation timeline). Sent verbatim to the
  // server as the outgoing email's quoted trail.
  const [editedQuotedHtml, setEditedQuotedHtml] = useState<string>(quote?.bodyHtml ?? "");
  useEffect(() => {
    setEditedQuotedHtml(quote?.bodyHtml ?? "");
  }, [quote?.bodyHtml]);

  const handleEditorChange = useCallback((html: string, text: string) => {
    setBodyHtml(html);
    setBodyText(text);
    setEditorContent(html);
  }, []);

  // Inject greeting + signature + footer once on mount
  const [draftInjected, setDraftInjected] = useState(false);

  useEffect(() => {
    if (draftInjected || !ticketSettings || !meData) return;

    const { replyDraftEnabled, replyGreeting, replyFooter } = ticketSettings;
    const sig = meData.user.preference?.signature ?? "";
    const parts: string[] = [];

    if (replyDraftEnabled && replyType !== "forward") {
      const firstName = ticket.senderName.split(" ")[0] ?? ticket.senderName;
      const greeting = (replyGreeting ?? "Hi {senderName},").replace(/\{senderName\}/g, firstName);
      parts.push(`<p>${greeting}</p>`);
    }

    parts.push("<p><br></p>");

    if (replyDraftEnabled && replyType !== "forward") {
      const footer = (replyFooter ?? "Your Ticket number is {ticketNumber}.").replace(/\{ticketNumber\}/g, ticket.ticketNumber);
      parts.push("<p><br></p>", `<p>${footer}</p>`);
    }

    if (sig) parts.push("<p><br></p>", sig);

    setEditorContent(parts.join(""));
    setDraftInjected(true);
  }, [ticketSettings, meData, draftInjected, ticket, replyType]);

  const replyMutation = useMutation({
    mutationFn: async () => {
      // Read from refs so any draft committed by the input's blur handler
      // (which fires synchronously between mousedown and click) is included.
      const toLatest  = toChipsRef.current;
      const ccLatest  = ccChipsRef.current;
      const bccLatest = bccChipsRef.current;

      const toJoined = toLatest.join(", ");
      if (!toJoined) throw new Error("Please add at least one recipient.");

      const ccArr  = replyType === "reply_sender" ? [] : ccLatest;
      const bccArr = bccLatest;

      // For non-forward replies, send `to` only when the chips differ from the
      // single original sender (so default replies match historical behaviour).
      const toDifferentFromOriginal =
        toLatest.length !== 1 ||
        toLatest[0]!.trim().toLowerCase() !== ticket.senderEmail.toLowerCase();

      const { data: reply } = await axios.post(`/api/tickets/${ticketId}/replies`, {
        body: bodyText,
        bodyHtml,
        replyType,
        attachmentIds: stagedFiles.map((f) => f.id),
        ...(replyType === "forward" && { forwardTo: toJoined }),
        ...(replyType !== "forward" && toDifferentFromOriginal && { to: toJoined }),
        ...(ccArr.length  && { cc:  ccArr  }),
        ...(bccArr.length && { bcc: bccArr }),
        ...(quote && editedQuotedHtml && { quotedHtml: editedQuotedHtml }),
      });
      return reply;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["replies", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["conversation", ticketId] });
      setBodyHtml("");
      setBodyText("");
      setEditorContent("");
      setStagedFiles([]);
      setUploadError(null);
      onSent?.();
    },
  });

  const polishMutation = useMutation({
    mutationFn: async () => {
      const { data } = await axios.post(`/api/tickets/${ticketId}/replies/polish`, { body: bodyText });
      return data.body as string;
    },
    onSuccess: (polished) => setEditorContent(`<p>${polished}</p>`),
  });

  // ── Undo Send (Gmail-style) ────────────────────────────────────────────────
  //
  // When `replyUndoEnabled`, clicking Send doesn't immediately POST to the
  // server — instead we hold the message in component state for `undoSeconds`,
  // then fire the mutation. During the window the composer is replaced with a
  // banner showing a countdown and an Undo button. Closing the tab cancels the
  // send (matches the user's mental model: undo before delivery).
  const undoEnabled = ticketSettings?.replyUndoEnabled ?? false;
  const undoSeconds = Math.max(3, Math.min(30, ticketSettings?.replyUndoSeconds ?? 7));
  const [pendingSecondsLeft, setPendingSecondsLeft] = useState<number | null>(null);
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPending = pendingSecondsLeft !== null;

  const clearPendingTimers = useCallback(() => {
    if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    sendTimerRef.current = null;
    tickIntervalRef.current = null;
  }, []);

  // Cancel the in-flight send if the user navigates away mid-window.
  // We do NOT auto-fire on unmount because the form state would be lost
  // anyway, and silently sending would surprise users.
  useEffect(() => () => clearPendingTimers(), [clearPendingTimers]);

  function handleSendClick() {
    if (toChipsRef.current.length === 0 || !bodyText.trim()) return;
    if (!undoEnabled) {
      replyMutation.mutate();
      return;
    }
    // Begin undo window — countdown then fire the mutation.
    setPendingSecondsLeft(undoSeconds);
    tickIntervalRef.current = setInterval(() => {
      setPendingSecondsLeft((s) => (s !== null && s > 1 ? s - 1 : s));
    }, 1000);
    sendTimerRef.current = setTimeout(() => {
      clearPendingTimers();
      setPendingSecondsLeft(null);
      replyMutation.mutate();
    }, undoSeconds * 1000);
  }

  function handleUndo() {
    clearPendingTimers();
    setPendingSecondsLeft(null);
  }

  // Skip the rest of the undo countdown and fire the send immediately —
  // for agents who are sure and don't want to wait.
  function handleSendNow() {
    clearPendingTimers();
    setPendingSecondsLeft(null);
    replyMutation.mutate();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    if (stagedFiles.length + files.length > 5) {
      setUploadError("Maximum 5 attachments per reply.");
      e.target.value = "";
      return;
    }
    setUploadError(null);
    for (const file of files) {
      try {
        const form = new FormData();
        form.append("file", file);
        const { data } = await axios.post<StagedFile>(
          `/api/tickets/${ticketId}/attachments/upload`,
          form,
          { headers: { "Content-Type": "multipart/form-data" } }
        );
        setStagedFiles((prev) => [...prev, data]);
      } catch (err) {
        const msg = axios.isAxiosError(err)
          ? (err.response?.data as { error?: string })?.error ?? err.message
          : "Upload failed";
        setUploadError(`${file.name}: ${msg}`);
      }
    }
    e.target.value = "";
  }

  function removeFile(id: number) {
    setStagedFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function handleMentionSelect(email: string) {
    if (!email) return;
    setShowCcBcc(true);
    const prev = ccChipsRef.current;
    if (prev.some((e) => e.toLowerCase() === email.toLowerCase())) return;
    setCcChips([...prev, email]);
  }

  function handleMacroInsert(resolvedBody: string) {
    const html = resolvedBody
      .split("\n\n")
      .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
      .join("");
    editorRef.current?.insertAtCursor(html);
  }

  const isBusy = replyMutation.isPending || polishMutation.isPending || isPending;
  const canSubmit = bodyText.trim().length > 0 && !isBusy && toChips.length > 0;
  const sendLabel = replyType === "forward" ? "Forward" : "Send Reply";

  // Pending-undo banner — replaces the composer while the send is held.
  if (isPending) {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/[0.04] dark:bg-primary/[0.08] shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="relative h-8 w-8 shrink-0">
            {/* Animated countdown ring */}
            <svg className="h-8 w-8 -rotate-90" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="2.5"
                className="text-primary/15" />
              <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" strokeDasharray={2 * Math.PI * 13}
                strokeDashoffset={2 * Math.PI * 13 * (1 - (pendingSecondsLeft ?? 0) / undoSeconds)}
                className="text-primary transition-[stroke-dashoffset] duration-1000 ease-linear" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums text-primary">
              {pendingSecondsLeft}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {replyType === "forward" ? "Forward" : "Reply"} sent
            </p>
            <p className="text-xs text-muted-foreground">
              Holding for {pendingSecondsLeft}s — close the tab or click Undo to cancel.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUndo}
              className="h-8 gap-1.5 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
            >
              <X className="h-3.5 w-3.5" />
              Undo
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSendNow}
              className="h-8 gap-1.5 shadow-sm"
              title="Skip the undo window and send immediately"
            >
              <Send className="h-3.5 w-3.5" />
              Send now
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Composer card */}
      <div className="rounded-xl border border-border/70 shadow-sm bg-background overflow-hidden">

        {/* Addressing header — Gmail-style chip recipients */}
        <div className="divide-y divide-border/60">
          {/* To row */}
          <div className="flex items-start px-4 py-2 gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-7 shrink-0 select-none mt-1.5">
              To
            </span>
            <EmailChipsInput
              value={toChips}
              onChange={setToChips}
              ariaLabel="Recipients"
              placeholder={replyType === "forward" ? "Enter recipient email…" : "Add recipient"}
              disabled={isBusy}
              containerClassName="flex-1"
            />
            <button
              type="button"
              onClick={() => setShowCcBcc((v) => !v)}
              className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors shrink-0 mt-1
                ${showCcBcc
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
            >
              CC / BCC
              <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${showCcBcc ? "rotate-180" : ""}`} />
            </button>
          </div>

          {/* CC row */}
          {showCcBcc && (
            <>
              <div className="flex items-start px-4 py-2 gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-7 shrink-0 select-none mt-1.5">
                  CC
                </span>
                <EmailChipsInput
                  value={ccChips}
                  onChange={setCcChips}
                  ariaLabel="CC recipients"
                  placeholder="Add CC — press , or Enter"
                  disabled={isBusy}
                  containerClassName="flex-1"
                />
              </div>
              <div className="flex items-start px-4 py-2 gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-7 shrink-0 select-none mt-1.5">
                  BCC
                </span>
                <EmailChipsInput
                  value={bccChips}
                  onChange={setBccChips}
                  ariaLabel="BCC recipients"
                  placeholder="Add hidden recipients"
                  disabled={isBusy}
                  containerClassName="flex-1"
                />
              </div>
            </>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-border/60" />

        {/* Editor area */}
        <div className="px-1">
          <RichTextEditor
            ref={editorRef}
            content={editorContent}
            onChange={handleEditorChange}
            placeholder="Write your reply… Use @ to mention a team member"
            minHeight="180px"
            disabled={isBusy}
            enableMentions
            onMentionSelect={handleMentionSelect}
            className="border-0 shadow-none rounded-none"
          />
        </div>

        {/* Quoted mail trail */}
        {quote && (
          <QuotedTrail
            quote={quote}
            replyType={replyType}
            value={editedQuotedHtml}
            onChange={setEditedQuotedHtml}
            onReset={() => setEditedQuotedHtml(quote.bodyHtml)}
            disabled={isBusy}
          />
        )}

        {/* Attachment chips */}
        {stagedFiles.length > 0 && (
          <div className="px-4 pb-2 flex flex-wrap gap-2">
            {stagedFiles.map((f) => (
              <div
                key={f.id}
                className="inline-flex items-center gap-1.5 rounded-full border bg-muted/60 px-3 py-1 text-xs"
              >
                <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="truncate max-w-[160px]" title={f.filename}>{f.filename}</span>
                <span className="text-muted-foreground/60">· {formatBytes(f.size)}</span>
                <button
                  type="button"
                  onClick={() => removeFile(f.id)}
                  className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
                  title="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Errors */}
        {(replyMutation.error || polishMutation.error || uploadError) && (
          <div className="px-4 pb-3 space-y-2">
            {replyMutation.error && <ErrorAlert error={replyMutation.error} fallback="Failed to send reply" />}
            {polishMutation.error && <ErrorAlert error={polishMutation.error} fallback="Failed to polish reply" />}
            {uploadError && <ErrorAlert message={uploadError} />}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-1.5 px-3 py-2.5 border-t border-border/60 bg-muted/30">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept=".jpg,.jpeg,.png,.gif,.webp,.svg,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"
            onChange={handleFileChange}
            disabled={isBusy || stagedFiles.length >= 5}
          />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy || stagedFiles.length >= 5}
            title={stagedFiles.length >= 5 ? "Maximum 5 attachments reached" : "Attach file"}
          >
            <Paperclip className="h-4 w-4" />
            {stagedFiles.length > 0 ? `${stagedFiles.length} attached` : "Attach"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => setMacroPickerOpen(true)}
            disabled={isBusy}
          >
            <BookOpen className="h-4 w-4" />
            Macros
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => setSaveMacroOpen(true)}
            disabled={isBusy || !bodyText.trim()}
            title={!bodyText.trim() ? "Write a reply first to save it as a macro" : "Save reply as macro"}
          >
            <BookmarkPlus className="h-4 w-4" />
            Save as Macro
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
            disabled={!bodyText.trim() || isBusy}
            onClick={() => polishMutation.mutate()}
          >
            <Sparkles className="h-4 w-4" />
            {polishMutation.isPending ? "Polishing…" : "Polish"}
          </Button>

          {/* Spacer */}
          <div className="flex-1" />

          <Button
            type="button"
            size="sm"
            disabled={!canSubmit}
            onClick={handleSendClick}
            className="gap-2 px-5 h-8 font-medium shadow-sm"
          >
            {replyMutation.isPending
              ? <><span className="h-3.5 w-3.5 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />Sending…</>
              : <><Send className="h-3.5 w-3.5" />{sendLabel}</>
            }
          </Button>
        </div>
      </div>

      <MacroPicker
        open={macroPickerOpen}
        onClose={() => setMacroPickerOpen(false)}
        onSelect={handleMacroInsert}
        context={{
          customerName: ticket.senderName,
          customerEmail: ticket.senderEmail,
          ticketId: ticket.id,
          agentName: session?.user?.name ?? "Agent",
        }}
      />

      <SaveMacroDialog
        open={saveMacroOpen}
        onClose={() => setSaveMacroOpen(false)}
        bodyText={bodyText}
        canManage={
          (session?.user as any)?.role === "admin" ||
          (session?.user as any)?.role === "supervisor"
        }
      />
    </>
  );
}
