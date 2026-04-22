import { useRef, useState, useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { type Ticket } from "core/constants/ticket.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ErrorAlert from "@/components/ErrorAlert";
import MacroPicker from "@/components/MacroPicker";
import SaveMacroDialog from "@/components/SaveMacroDialog";
import RichTextEditor, { type RichTextEditorHandle } from "@/components/RichTextEditor";
import { useSession } from "@/lib/auth-client";
import { useMe } from "@/hooks/useMe";
import { useSettings } from "@/hooks/useSettings";
import { BookOpen, BookmarkPlus, Paperclip, X, ChevronDown, Send, Sparkles, Quote } from "lucide-react";
import RichTextRenderer from "@/components/RichTextRenderer";

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

function parseEmails(raw: string): string[] {
  return raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

// ── Quoted trail ──────────────────────────────────────────────────────────────

function QuotedTrail({ quote, replyType }: { quote: QuoteData; replyType: ReplyType }) {
  const [open, setOpen] = useState(false);

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
        <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Expanded content */}
      {open && (
        <div className="mt-2 rounded-lg border border-border/60 overflow-hidden">
          {/* Header bar */}
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border/40">
            <Quote className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-[11px] text-muted-foreground italic truncate">{headerLine}</span>
          </div>
          {/* Body */}
          <div className="px-3 py-3 text-sm opacity-70 max-h-48 overflow-y-auto border-l-2 border-muted-foreground/20 ml-0">
            <RichTextRenderer content={quote.bodyHtml} />
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

  // Addressing fields — "to" is editable and pre-seeded from the ticket
  const [to, setTo] = useState(replyType === "forward" ? "" : ticket.senderEmail);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);

  // Keep "to" in sync when replyType changes (parent switches mode)
  useEffect(() => {
    if (replyType !== "forward") setTo(ticket.senderEmail);
    else setTo("");
  }, [replyType, ticket.senderEmail]);

  // Rich-text state
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [editorContent, setEditorContent] = useState("");

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
      if (!to.trim()) throw new Error("Please enter a recipient email address.");

      const { data: reply } = await axios.post(`/api/tickets/${ticketId}/replies`, {
        body: bodyText,
        bodyHtml,
        replyType,
        attachmentIds: stagedFiles.map((f) => f.id),
        ...(replyType === "forward" && { forwardTo: to.trim() }),
        ...(replyType !== "reply_sender" && cc.trim() && { cc: parseEmails(cc) }),
        ...(bcc.trim() && { bcc: parseEmails(bcc) }),
        ...(quote && { quotedHtml: quote.bodyHtml }),
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

  function handleMacroInsert(resolvedBody: string) {
    const html = resolvedBody
      .split("\n\n")
      .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
      .join("");
    editorRef.current?.insertAtCursor(html);
  }

  const isBusy = replyMutation.isPending || polishMutation.isPending;
  const canSubmit = bodyText.trim().length > 0 && !isBusy;
  const sendLabel = replyType === "forward" ? "Forward" : "Send Reply";

  return (
    <>
      {/* Composer card */}
      <div className="rounded-xl border border-border/70 shadow-sm bg-background overflow-hidden">

        {/* Addressing header */}
        <div className="divide-y divide-border/60">
          {/* To row */}
          <div className="flex items-center px-4 py-2 gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-7 shrink-0 select-none">
              To
            </span>
            <Input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={replyType === "forward" ? "Enter recipient email…" : ticket.senderEmail}
              className="flex-1 border-0 shadow-none focus-visible:ring-0 h-8 px-1 text-sm bg-transparent"
              disabled={isBusy}
            />
            <button
              type="button"
              onClick={() => setShowCcBcc((v) => !v)}
              className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors shrink-0
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
              <div className="flex items-center px-4 py-2 gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-7 shrink-0 select-none">
                  CC
                </span>
                <Input
                  type="text"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="Separate multiple emails with commas"
                  className="flex-1 border-0 shadow-none focus-visible:ring-0 h-8 px-1 text-sm bg-transparent"
                  disabled={isBusy}
                />
              </div>
              <div className="flex items-center px-4 py-2 gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-7 shrink-0 select-none">
                  BCC
                </span>
                <Input
                  type="text"
                  value={bcc}
                  onChange={(e) => setBcc(e.target.value)}
                  placeholder="Hidden recipients"
                  className="flex-1 border-0 shadow-none focus-visible:ring-0 h-8 px-1 text-sm bg-transparent"
                  disabled={isBusy}
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
            className="border-0 shadow-none rounded-none"
          />
        </div>

        {/* Quoted mail trail */}
        {quote && <QuotedTrail quote={quote} replyType={replyType} />}

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
            onClick={() => replyMutation.mutate()}
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
