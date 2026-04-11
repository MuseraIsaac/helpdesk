import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { type Ticket } from "core/constants/ticket.ts";
import { createReplySchema, type CreateReplyInput } from "core/schemas/replies.ts";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import MacroPicker from "@/components/MacroPicker";
import { useSession } from "@/lib/auth-client";
import { BookOpen, Paperclip, X } from "lucide-react";

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

interface ReplyFormProps {
  ticket: Ticket;
}

export default function ReplyForm({ ticket }: ReplyFormProps) {
  const ticketId = ticket.id;
  const queryClient = useQueryClient();
  const [macroPickerOpen, setMacroPickerOpen] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: session } = useSession();

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateReplyInput>({
    resolver: zodResolver(createReplySchema),
  });

  const bodyValue = watch("body");

  const replyMutation = useMutation({
    mutationFn: async (data: CreateReplyInput) => {
      const { data: reply } = await axios.post(
        `/api/tickets/${ticketId}/replies`,
        {
          body: data.body,
          attachmentIds: stagedFiles.map((f) => f.id),
        }
      );
      return reply;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["replies", ticketId] });
      reset();
      setStagedFiles([]);
      setUploadError(null);
    },
  });

  const polishMutation = useMutation({
    mutationFn: async () => {
      const { data } = await axios.post(`/api/tickets/${ticketId}/replies/polish`, {
        body: getValues("body"),
      });
      return data.body as string;
    },
    onSuccess: (polishedText) => {
      setValue("body", polishedText, { shouldValidate: true });
    },
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    // Enforce client-side limit (server also enforces)
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

    // Reset file input so the same file can be re-selected if removed
    e.target.value = "";
  }

  function removeFile(id: number) {
    setStagedFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function handleMacroInsert(resolvedBody: string) {
    setValue("body", resolvedBody, { shouldValidate: true });
  }

  const isBusy = replyMutation.isPending || polishMutation.isPending;

  return (
    <>
      <form onSubmit={handleSubmit((data) => replyMutation.mutate(data))} className="space-y-3">
        {replyMutation.error && (
          <ErrorAlert error={replyMutation.error} fallback="Failed to send reply" />
        )}
        {polishMutation.error && (
          <ErrorAlert error={polishMutation.error} fallback="Failed to polish reply" />
        )}
        {uploadError && (
          <ErrorAlert message={uploadError} />
        )}

        <div className="space-y-1">
          <Textarea
            placeholder="Type your reply..."
            {...register("body")}
            rows={4}
          />
          {errors.body && <ErrorMessage message={errors.body.message} />}
        </div>

        {/* Staged attachment chips */}
        {stagedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {stagedFiles.map((f) => (
              <div
                key={f.id}
                className="inline-flex items-center gap-1.5 rounded-md border bg-muted/60 px-2.5 py-1.5 text-xs"
              >
                <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="truncate max-w-[140px]" title={f.filename}>{f.filename}</span>
                <span className="text-muted-foreground">({formatBytes(f.size)})</span>
                <button
                  type="button"
                  onClick={() => removeFile(f.id)}
                  className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
                  title="Remove attachment"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept=".jpg,.jpeg,.png,.gif,.webp,.svg,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"
            onChange={handleFileChange}
            disabled={isBusy || stagedFiles.length >= 5}
          />

          {/* Attach file button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy || stagedFiles.length >= 5}
            title={stagedFiles.length >= 5 ? "Maximum 5 attachments reached" : "Attach a file"}
          >
            <Paperclip className="h-3.5 w-3.5" />
            {stagedFiles.length > 0 ? `${stagedFiles.length} file${stagedFiles.length > 1 ? "s" : ""}` : "Attach"}
          </Button>

          {/* Macro picker — inserts a saved template */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setMacroPickerOpen(true)}
            disabled={isBusy}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Macros
          </Button>

          {/* AI polish — refines existing draft */}
          <Button
            type="button"
            variant="outline"
            disabled={!bodyValue?.trim() || isBusy}
            onClick={() => polishMutation.mutate()}
          >
            {polishMutation.isPending ? "Polishing..." : "Polish"}
          </Button>

          <Button
            type="submit"
            disabled={!bodyValue?.trim() || isBusy}
          >
            {replyMutation.isPending ? "Sending..." : "Send Reply"}
          </Button>
        </div>
      </form>

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
    </>
  );
}
