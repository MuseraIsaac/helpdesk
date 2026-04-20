/**
 * ChangeAttachmentsPanel — list, upload, download, and delete attachments
 * for a change request.
 *
 * Endpoints:
 *   GET    /api/changes/:changeId/attachments          — list
 *   POST   /api/changes/:changeId/attachments/upload   — upload (multipart)
 *   GET    /api/changes/:changeId/attachments/:id/token — signed download token
 *   DELETE /api/changes/:changeId/attachments/:id      — delete
 */

import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ErrorAlert from "@/components/ErrorAlert";
import {
  Paperclip,
  Download,
  Trash2,
  Upload,
  File,
  FileImage,
  FileText,
  FileArchive,
  Loader2,
  Tag,
} from "lucide-react";
import { changeDocumentTypes, changeDocumentTypeLabel, type ChangeDocumentType } from "core/constants/change.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Attachment {
  id: number;
  filename: string;
  mimeType: string;
  size: number;
  documentType: ChangeDocumentType | null;
  virusScanStatus: string;
  checksum: string | null;
  createdAt: string;
  uploadedBy: { id: string; name: string } | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  const cls = "h-4 w-4 shrink-0 text-muted-foreground";
  if (mimeType.startsWith("image/"))       return <FileImage   className={cls} />;
  if (mimeType === "application/pdf")      return <FileText    className={cls} />;
  if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("gz"))
    return <FileArchive className={cls} />;
  if (mimeType.startsWith("text/"))        return <FileText    className={cls} />;
  return <File className={cls} />;
}

function scanBadge(status: string) {
  if (status === "infected")
    return <span className="text-[10px] text-destructive font-medium">Virus detected</span>;
  if (status === "pending")
    return <span className="text-[10px] text-amber-600 font-medium">Scan pending</span>;
  return null;
}

// ── ChangeAttachmentsPanel ────────────────────────────────────────────────────

interface Props {
  changeId: number;
  readonly?: boolean;
}

export default function ChangeAttachmentsPanel({ changeId, readonly = false }: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [pendingDocType, setPendingDocType] = useState<ChangeDocumentType | "">("");

  // ── List query ──────────────────────────────────────────────────────────────

  const { data, isLoading, error } = useQuery({
    queryKey: ["change-attachments", changeId],
    queryFn: async () => {
      const { data } = await axios.get<{ attachments: Attachment[] }>(
        `/api/changes/${changeId}/attachments`
      );
      return data.attachments;
    },
  });

  const attachments = data ?? [];

  // ── Upload mutation ─────────────────────────────────────────────────────────

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      if (pendingDocType) form.append("documentType", pendingDocType);
      await axios.post(
        `/api/changes/${changeId}/attachments/upload`,
        form,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
    },
    onSuccess: () => {
      setUploadError(null);
      void queryClient.invalidateQueries({ queryKey: ["change-attachments", changeId] });
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        setUploadError(
          err.response?.data?.error ?? "Upload failed. Check file type and size."
        );
      }
    },
  });

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    uploadMutation.mutate(file);
  }

  // ── Download (signed token) ─────────────────────────────────────────────────

  async function handleDownload(attachment: Attachment) {
    setDownloadingId(attachment.id);
    try {
      const { data } = await axios.get<{ url: string }>(
        `/api/changes/${changeId}/attachments/${attachment.id}/token`
      );
      const a = document.createElement("a");
      a.href = data.url;
      a.download = attachment.filename;
      a.click();
    } finally {
      setDownloadingId(null);
    }
  }

  // ── Delete mutation ─────────────────────────────────────────────────────────

  async function handleDelete(id: number) {
    if (!confirm("Delete this attachment? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await axios.delete(`/api/changes/${changeId}/attachments/${id}`);
      void queryClient.invalidateQueries({ queryKey: ["change-attachments", changeId] });
    } finally {
      setDeletingId(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Upload bar */}
      {!readonly && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Label className="text-[11px] text-muted-foreground shrink-0">
                <Tag className="h-3 w-3 inline mr-1" />
                Document type
              </Label>
              <Select
                value={pendingDocType}
                onValueChange={(v) => setPendingDocType(v as ChangeDocumentType | "")}
              >
                <SelectTrigger className="h-7 text-xs w-52">
                  <SelectValue placeholder="(optional)" />
                </SelectTrigger>
                <SelectContent>
                  {changeDocumentTypes.map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">
                      {changeDocumentTypeLabel[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={onFileChange}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
            >
              {uploadMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {uploadMutation.isPending ? "Uploading…" : "Upload File"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Max 25 MB · PDF, Office docs, images, archives
          </p>
        </div>
      )}

      {uploadError && <ErrorAlert message={uploadError} />}
      {error && <ErrorAlert error={error} fallback="Failed to load attachments" />}

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-10 rounded bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : attachments.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-8 text-center">
          <Paperclip className="h-7 w-7 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No attachments</p>
          {!readonly && (
            <p className="text-xs text-muted-foreground/70">
              Upload documents, screenshots, or supporting files.
            </p>
          )}
        </div>
      ) : (
        <div className="divide-y divide-border/50 border rounded-md">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-3 px-3 py-2.5 group"
            >
              <FileIcon mimeType={att.mimeType} />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate leading-snug">
                  {att.filename}
                </p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {att.documentType && (
                    <span className="text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 rounded px-1.5 py-0.5 leading-none">
                      {changeDocumentTypeLabel[att.documentType]}
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    {formatSize(att.size)}
                  </span>
                  {att.uploadedBy && (
                    <span className="text-[11px] text-muted-foreground">
                      · {att.uploadedBy.name}
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    · {new Date(att.createdAt).toLocaleDateString()}
                  </span>
                  {scanBadge(att.virusScanStatus)}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {att.virusScanStatus !== "infected" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    title="Download"
                    onClick={() => handleDownload(att)}
                    disabled={downloadingId === att.id}
                  >
                    {downloadingId === att.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
                {!readonly && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    title="Delete"
                    onClick={() => handleDelete(att.id)}
                    disabled={deletingId === att.id}
                  >
                    {deletingId === att.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
