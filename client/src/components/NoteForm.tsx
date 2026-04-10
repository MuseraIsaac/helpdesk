import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { createNoteSchema, type CreateNoteInput } from "core/schemas/notes.ts";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import { Lock } from "lucide-react";

interface NoteFormProps {
  ticketId: number;
}

export default function NoteForm({ ticketId }: NoteFormProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<CreateNoteInput>({
    resolver: zodResolver(createNoteSchema),
  });

  const bodyValue = watch("body");

  const mutation = useMutation({
    mutationFn: async (data: CreateNoteInput) => {
      const { data: note } = await axios.post(
        `/api/tickets/${ticketId}/notes`,
        data
      );
      return note;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes", ticketId] });
      reset();
    },
  });

  return (
    <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-3">
      {/* Explicit visibility warning — makes it impossible to accidentally mistake this for a customer reply */}
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

      <div className="space-y-1">
        <Textarea
          placeholder="Add an internal note — observations, next steps, context for the team..."
          {...register("body")}
          rows={4}
          className="border-amber-300/50 focus-visible:ring-amber-400/50 bg-amber-500/3"
        />
        {errors.body && <ErrorMessage message={errors.body.message} />}
      </div>

      <div className="flex gap-2">
        <Button
          type="submit"
          variant="outline"
          className="border-amber-300 text-amber-700 hover:bg-amber-500/10 hover:text-amber-800"
          disabled={!bodyValue?.trim() || mutation.isPending}
        >
          <Lock className="h-3.5 w-3.5 mr-1.5" />
          {mutation.isPending ? "Saving..." : "Save Internal Note"}
        </Button>
      </div>
    </form>
  );
}
