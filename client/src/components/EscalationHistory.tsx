import { type EscalationEvent } from "core/constants/ticket.ts";
import { escalationReasonLabel } from "core/constants/escalation-reason.ts";
import { AlertTriangle } from "lucide-react";

interface EscalationHistoryProps {
  events: EscalationEvent[];
}

export default function EscalationHistory({ events }: EscalationHistoryProps) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No escalation events recorded.</p>
    );
  }

  return (
    <ol className="space-y-2">
      {events.map((event, idx) => (
        <li key={event.id} className="flex items-start gap-3 text-sm">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-500">
            <AlertTriangle className="h-3 w-3" />
          </span>
          <div>
            <span className="font-medium">{escalationReasonLabel[event.reason]}</span>
            <span className="text-muted-foreground ml-2 text-xs">
              {new Date(event.createdAt).toLocaleString()}
            </span>
            {idx === 0 && (
              <span className="ml-2 text-xs text-muted-foreground">(first)</span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
