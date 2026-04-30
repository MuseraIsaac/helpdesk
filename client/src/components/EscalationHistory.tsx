import { type EscalationEvent } from "core/constants/ticket.ts";
import { escalationReasonLabel } from "core/constants/escalation-reason.ts";
import { AlertTriangle } from "lucide-react";

interface EscalationHistoryProps {
  events: EscalationEvent[];
  escalatedToTeam?: { id: number; name: string; color: string } | null;
  escalatedToUser?: { id: string; name: string } | null;
}

export default function EscalationHistory({
  events,
  escalatedToTeam,
  escalatedToUser,
}: EscalationHistoryProps) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No escalation events recorded.</p>
    );
  }

  const lastManualIdx = (() => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].reason === "manual") return i;
    }
    return -1;
  })();

  return (
    <ol className="space-y-2">
      {events.map((event, idx) => {
        const isLatestManual = idx === lastManualIdx;
        const showTarget = isLatestManual && (escalatedToTeam || escalatedToUser);
        const targetLabel = showTarget
          ? [escalatedToTeam?.name, escalatedToUser?.name].filter(Boolean).join(" / ")
          : null;
        return (
          <li key={event.id} className="flex items-start gap-3 text-sm">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-500">
              <AlertTriangle className="h-3 w-3" />
            </span>
            <div>
              <span className="font-medium">
                {escalationReasonLabel[event.reason]}
                {targetLabel && (
                  <> to <span className="text-foreground">{targetLabel}</span></>
                )}
              </span>
              <span className="text-muted-foreground ml-2 text-xs">
                {new Date(event.createdAt).toLocaleString()}
              </span>
              {idx === 0 && (
                <span className="ml-2 text-xs text-muted-foreground">(first)</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
