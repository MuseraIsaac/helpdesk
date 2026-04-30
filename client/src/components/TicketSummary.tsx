import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { Sparkles } from "lucide-react";
import { type Ticket } from "core/constants/ticket.ts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ErrorAlert from "@/components/ErrorAlert";
import { useSettings } from "@/hooks/useSettings";

interface TicketSummaryProps {
  ticket: Ticket;
}

/**
 * "Summarize" widget rendered at the *bottom* of the conversation thread.
 * Collapses the customer's original message + every agent/customer reply
 * into a 2–4 sentence brief. The server endpoint already pulls the entire
 * conversation; this component only triggers it.
 *
 * Visibility is controlled by the `summarizeEnabled` flag in the Tickets
 * settings — admins can hide the button organisation-wide. Default on.
 */
export default function TicketSummary({ ticket }: TicketSummaryProps) {
  const { data: ticketSettings } = useSettings("tickets");
  // Default to true while the settings query is in-flight so the button
  // doesn't flash off then on for the common (enabled) case.
  const enabled = ticketSettings?.summarizeEnabled ?? true;

  const summarizeMutation = useMutation({
    mutationFn: async () => {
      const { data } = await axios.post(
        `/api/tickets/${ticket.id}/replies/summarize`
      );
      return data.summary as string;
    },
  });

  if (!enabled) return null;

  return (
    <div className="space-y-3 mt-4">
      <Button
        variant="outline"
        onClick={() => summarizeMutation.mutate()}
        disabled={summarizeMutation.isPending}
        className="gap-2"
      >
        <Sparkles className="h-4 w-4 text-primary" />
        {summarizeMutation.isPending ? "Summarizing…" : "Summarize conversation"}
      </Button>

      {summarizeMutation.error && (
        <ErrorAlert
          error={summarizeMutation.error}
          fallback="Failed to generate summary"
        />
      )}

      {summarizeMutation.data && (
        <Card className="border-chart-3/25 bg-chart-3/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-2.5">
              <div className="h-6 w-6 rounded-md bg-chart-3/15 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="h-3.5 w-3.5 text-chart-3" />
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {summarizeMutation.data}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
