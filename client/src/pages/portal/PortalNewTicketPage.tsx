import { useState, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  portalCreateTicketSchema,
  type PortalCreateTicketInput,
} from "core/schemas/portal.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ErrorAlert from "@/components/ErrorAlert";
import ArticleSuggestions from "@/components/ArticleSuggestions";
import RichTextEditor from "@/components/RichTextEditor";
import {
  ArrowLeft, Paperclip, X, FileText, Image, File,
  Upload, CheckCircle2, AlertTriangle, Loader2,
  MessageSquarePlus, BookOpen,
} from "lucide-react";

// ── File attachment helpers ────────────────────────────────────────────────────

const ALLOWED_EXTS = [
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "png", "jpg", "jpeg", "gif", "webp", "svg",
  "zip", "txt", "csv", "mp4", "mov",
];

const MAX_SIZE_MB = 10;
const MAX_FILES   = 5;

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png","jpg","jpeg","gif","webp","svg"].includes(ext)) return Image;
  if (["pdf","doc","docx","txt","csv"].includes(ext)) return FileText;
  return File;
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface AttachedFile {
  id: string;
  file: File;
  error?: string;
}

function validateFile(file: File): string | undefined {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTS.includes(ext)) return `File type .${ext} is not allowed`;
  if (file.size > MAX_SIZE_MB * 1024 * 1024) return `File exceeds ${MAX_SIZE_MB} MB limit`;
}

// ── Attachment row ─────────────────────────────────────────────────────────────

function AttachmentRow({
  af, onRemove,
}: { af: AttachedFile; onRemove: (id: string) => void }) {
  const Icon = fileIcon(af.file.name);
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
      af.error
        ? "border-destructive/40 bg-destructive/5"
        : "border-border/60 bg-muted/30"
    }`}>
      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${af.error ? "bg-destructive/10" : "bg-background border border-border/60"}`}>
        <Icon className={`h-4 w-4 ${af.error ? "text-destructive" : "text-muted-foreground"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-[13px] truncate text-foreground">{af.file.name}</p>
        {af.error
          ? <p className="text-[11px] text-destructive mt-0.5">{af.error}</p>
          : <p className="text-[11px] text-muted-foreground mt-0.5">{fmtSize(af.file.size)}</p>
        }
      </div>
      <button
        type="button"
        onClick={() => onRemove(af.id)}
        className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
        aria-label="Remove file"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Upload progress state ─────────────────────────────────────────────────────

type UploadState = "idle" | "uploading" | "done" | "error";

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PortalNewTicketPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [files,    setFiles]    = useState<AttachedFile[]>([]);
  const [dropOver, setDropOver] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>("idle");

  const { register, handleSubmit, watch, formState: { errors } } =
    useForm<PortalCreateTicketInput>({
      resolver: zodResolver(portalCreateTicketSchema),
      defaultValues: { body: " " },
    });

  const handleBodyChange = useCallback((html: string, text: string) => {
    setBodyHtml(html);
    setBodyText(text);
  }, []);

  const subject        = watch("subject") ?? "";
  const suggestionQuery = `${subject} ${bodyText}`.trim();
  const validFiles     = files.filter(f => !f.error);

  // ── Add files ────────────────────────────────────────────────────────────────

  function addFiles(incoming: FileList | File[]) {
    const list = Array.from(incoming);
    setFiles(prev => {
      const existing = prev.length;
      const canAdd   = MAX_FILES - existing;
      return [
        ...prev,
        ...list.slice(0, canAdd).map(f => ({
          id:    crypto.randomUUID(),
          file:  f,
          error: validateFile(f),
        })),
      ];
    });
  }

  function removeFile(id: string) {
    setFiles(prev => prev.filter(f => f.id !== id));
  }

  // ── Drag-and-drop ─────────────────────────────────────────────────────────────

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDropOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }

  // ── Mutation ──────────────────────────────────────────────────────────────────

  const mutation = useMutation({
    mutationFn: async (data: PortalCreateTicketInput) => {
      // Step 1: create ticket
      const { data: res } = await axios.post<{ ticket: { id: number } }>(
        "/api/portal/tickets",
        { ...data, body: bodyText, bodyHtml }
      );
      const ticketId = res.ticket.id;

      // Step 2: upload attachments (if any valid files)
      if (validFiles.length > 0) {
        setUploadState("uploading");
        await Promise.all(
          validFiles.map(({ file }) => {
            const fd = new FormData();
            fd.append("file", file);
            return axios.post(`/api/portal/tickets/${ticketId}/attachments`, fd, {
              headers: { "Content-Type": "multipart/form-data" },
            });
          })
        );
        setUploadState("done");
      }

      return res.ticket;
    },
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ["portal-tickets"] });
      navigate(`/portal/tickets/${ticket.id}`, { replace: true });
    },
    onError: () => setUploadState("error"),
  });

  const canSubmit = bodyText.trim().length > 0 && !mutation.isPending;

  return (
    <div className="max-w-[960px] space-y-6">

      {/* ── Back link ── */}
      <Link
        to="/portal/tickets"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to my tickets
      </Link>

      {/* ── Page header ── */}
      <div className="flex items-start gap-4">
        <div className="h-11 w-11 rounded-xl bg-emerald-600 flex items-center justify-center shadow-sm shrink-0"
          style={{ boxShadow: "0 4px 12px rgba(5,150,105,0.25)" }}>
          <MessageSquarePlus className="h-5.5 w-5.5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black tracking-tight">Submit a support ticket</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Describe your issue in detail and we'll get back to you as soon as possible.
          </p>
        </div>
      </div>

      {/* ── Error ── */}
      {mutation.error && (
        <ErrorAlert error={mutation.error} fallback="Failed to submit ticket. Please try again." />
      )}

      {/* ── Two-column layout: form | suggestions ── */}
      <div className="flex gap-6 items-start">
      {/* Form column */}
      <div className="flex-1 min-w-0">
      <form
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        noValidate
        className="space-y-5"
      >
        {/* Subject */}
        <div className="space-y-1.5">
          <Label htmlFor="subject" className="text-sm font-semibold">
            Subject <span className="text-destructive">*</span>
          </Label>
          <Input
            id="subject"
            type="text"
            placeholder="Brief summary of your issue or request"
            className="h-11 bg-muted/30 border-border/60 focus:bg-background transition-colors"
            {...register("subject")}
          />
          {errors.subject && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {errors.subject.message}
            </p>
          )}
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">
            Description <span className="text-destructive">*</span>
          </Label>
          <div className="rounded-xl border border-border/60 overflow-hidden focus-within:ring-1 focus-within:ring-ring transition-shadow bg-background">
            <RichTextEditor
              content={bodyHtml}
              onChange={handleBodyChange}
              placeholder="Please describe your issue in as much detail as possible — include any error messages, steps to reproduce, and what you expected to happen."
              minHeight="160px"
            />
          </div>
          {!bodyText.trim() && mutation.isError && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Description is required
            </p>
          )}
        </div>

        {/* ── File attachments ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Attachments</Label>
            <span className="text-[11px] text-muted-foreground">
              {files.length}/{MAX_FILES} files · max {MAX_SIZE_MB} MB each
            </span>
          </div>

          {/* Drop zone */}
          {files.length < MAX_FILES && (
            <div
              onDragOver={e => { e.preventDefault(); setDropOver(true); }}
              onDragLeave={() => setDropOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-all duration-150 ${
                dropOver
                  ? "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20"
                  : "border-border/50 bg-muted/20 hover:border-emerald-300 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10"
              }`}
            >
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center transition-colors ${dropOver ? "bg-emerald-100 dark:bg-emerald-900/40" : "bg-muted"}`}>
                <Upload className={`h-5 w-5 transition-colors ${dropOver ? "text-emerald-600" : "text-muted-foreground/50"}`} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  {dropOver ? "Drop files here" : "Drag & drop files or click to browse"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {ALLOWED_EXTS.slice(0, 6).map(e => `.${e}`).join(", ")} and more
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ALLOWED_EXTS.map(e => `.${e}`).join(",")}
                className="hidden"
                onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }}
              />
            </div>
          )}

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-2">
              {files.map(af => (
                <AttachmentRow key={af.id} af={af} onRemove={removeFile} />
              ))}
            </div>
          )}

          {/* Upload status */}
          {uploadState === "uploading" && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2 text-xs text-blue-700 dark:border-blue-800/40 dark:bg-blue-950/20 dark:text-blue-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              Uploading {validFiles.length} file{validFiles.length > 1 ? "s" : ""}…
            </div>
          )}
          {uploadState === "done" && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-950/20 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              {validFiles.length} file{validFiles.length > 1 ? "s" : ""} uploaded successfully
            </div>
          )}

          {/* Add more button (when files present but under limit) */}
          {files.length > 0 && files.length < MAX_FILES && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Paperclip className="h-3.5 w-3.5" />
              Attach another file ({MAX_FILES - files.length} remaining)
            </button>
          )}
        </div>

        {/* ── Submit ── */}
        <div className="flex items-center gap-3 pt-1">
          <Button
            type="submit"
            size="lg"
            disabled={!canSubmit}
            className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
            style={canSubmit ? { boxShadow: "0 4px 14px rgba(5,150,105,0.3)" } : undefined}
          >
            {mutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</>
            ) : (
              <>Submit ticket {validFiles.length > 0 && `· ${validFiles.length} file${validFiles.length > 1 ? "s" : ""}`}</>
            )}
          </Button>
          <Button type="button" variant="ghost" size="lg" onClick={() => navigate(-1)} disabled={mutation.isPending}>
            Cancel
          </Button>
        </div>
      </form>
      </div>{/* end form column */}

      {/* ── Suggestions sidebar ── */}
      <div className="hidden lg:flex w-[280px] shrink-0 flex-col gap-3 sticky top-20 self-start">
        {/* Dynamic KB suggestions — shown when query has ≥3 chars */}
        <ArticleSuggestions query={suggestionQuery} />

        {/* Static help panel — always visible */}
        <div className="rounded-xl border border-border/60 bg-background p-4 space-y-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
              <BookOpen className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-sm font-semibold">Before you submit</p>
          </div>
          <ul className="space-y-2 text-xs text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-4 w-4 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold shrink-0">1</span>
              Start typing your issue — related help articles will appear here automatically.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-4 w-4 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold shrink-0">2</span>
              Include error messages, steps to reproduce, and what you expected.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-4 w-4 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold shrink-0">3</span>
              Attach screenshots or files to help the support team understand your issue faster.
            </li>
          </ul>
          <Link
            to="/help"
            className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline underline-offset-4 transition-colors pt-1 border-t border-border/40"
          >
            <BookOpen className="h-3 w-3" />
            Browse the Help Center
          </Link>
        </div>
      </div>
      </div>{/* end two-column layout */}
    </div>
  );
}
