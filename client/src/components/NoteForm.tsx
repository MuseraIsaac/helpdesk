import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Button } from "@/components/ui/button";
import ErrorAlert from "@/components/ErrorAlert";
import RichTextEditor from "@/components/RichTextEditor";
import { Lock } from "lucide-react";

interface NoteFormProps {
  ticketId: number;
}

export default function NoteForm({ ticketId }: NoteFormProps) {
  const queryClient = useQueryClient();

  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyText, setBodyText] = useState("");

  const handleEditorChange = useCallback((html: string, text: string) => {
    setBodyHtml(html);
    setBodyText(text);
  }, []);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: note } = await axios.post(
        `/api/tickets/${ticketId}/notes`,
        { body: bodyText, bodyHtml }
      );
      return note;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["conversation", ticketId] });
      setBodyHtml("");
      setBodyText("");
    },
  });

  return (
    <div className="space-y-3">
      {/* Explicit visibility warning */}
      <div className="flex items-center gap-2 rounded-md border border-amber-300/60 bg-amber-500/8 px-3 py-2 text-xs text-amber-700">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        <span>
          <strong>Visible to agents and admins only.</strong> This note will never be sent to
          the customer.
        </span>
      </div>

      {mutation.error && (
        <ErrorAlert error={mutation.error} fallback="Failed to save note" />
      )}

      <RichTextEditor
        content={bodyHtml}
        onChange={handleEditorChange}
        placeholder="Add an internal note — observations, next steps, context for the team…"
        minHeight="100px"
        disabled={mutation.isPending}
        editorClassName="bg-amber-500/3"
        className="border-amber-300/50 focus-within:ring-amber-400/50"
      />

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="border-amber-300 text-amber-700 hover:bg-amber-500/10 hover:text-amber-800"
          disabled={!bodyText.trim() || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          <Lock className="h-3.5 w-3.5 mr-1.5" />
          {mutation.isPending ? "Saving…" : "Save Internal Note"}
        </Button>
      </div>
    </div>
  );
}
