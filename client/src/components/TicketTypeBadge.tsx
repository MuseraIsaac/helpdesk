import {
  type TicketType,
  ticketTypeLabel,
  ticketTypeStyles,
} from "core/constants/ticket-type.ts";

export default function TicketTypeBadge({ type }: { type: TicketType | null }) {
  if (!type) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${ticketTypeStyles[type]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {ticketTypeLabel[type]}
    </span>
  );
}
