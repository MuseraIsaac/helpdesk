import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ErrorAlert from "@/components/ErrorAlert";
import { Star, CheckCircle2 } from "lucide-react";

interface Props {
  ticketId: number;
}

const LABELS: Record<number, string> = {
  1: "Very unhappy",
  2: "Unhappy",
  3: "Neutral",
  4: "Happy",
  5: "Very happy",
};

export default function CsatRatingWidget({ ticketId }: Props) {
  const queryClient = useQueryClient();
  const [hovered, setHovered] = useState(0);
  const [selected, setSelected] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      await axios.post(`/api/portal/tickets/${ticketId}/csat`, {
        rating: selected,
        comment: comment.trim() || undefined,
      });
    },
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["portal-ticket", String(ticketId)] });
    },
  });

  if (submitted) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-500/5 px-4 py-5 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
        <div>
          <p className="text-sm font-medium">Thanks for your feedback!</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Your rating helps us improve our support.
          </p>
        </div>
      </div>
    );
  }

  const display = hovered || selected;

  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-5 space-y-4">
      <div>
        <p className="text-sm font-medium">How did we do?</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Rate your support experience for this ticket.
        </p>
      </div>

      {/* Star row */}
      <div className="flex items-center gap-1" role="group" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={LABELS[n]}
            className="p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => setSelected(n)}
          >
            <Star
              className={`h-7 w-7 transition-colors ${
                n <= display
                  ? "fill-yellow-400 text-yellow-400"
                  : "fill-none text-muted-foreground/40 hover:text-yellow-300"
              }`}
            />
          </button>
        ))}
        {display > 0 && (
          <span className="ml-2 text-xs text-muted-foreground">
            {LABELS[display]}
          </span>
        )}
      </div>

      {/* Optional comment — only shown after a star is selected */}
      {selected > 0 && (
        <div className="space-y-2">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment (optional)…"
            rows={2}
            maxLength={500}
            className="text-sm resize-none"
          />
          {mutation.error && (
            <ErrorAlert error={mutation.error} fallback="Failed to submit rating" />
          )}
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Submitting…" : "Submit rating"}
          </Button>
        </div>
      )}
    </div>
  );
}
