import {
  type TicketType,
  ticketTypeLabel,
  ticketTypeStyles,
} from "core/constants/ticket-type.ts";

interface TicketTypeBadgeProps {
  type: TicketType | null;
  customType?: { name: string; color: string } | null;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function TicketTypeBadge({ type, customType }: TicketTypeBadgeProps) {
  if (customType) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium"
        style={{
          backgroundColor: hexToRgba(customType.color, 0.15),
          color: customType.color,
        }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {customType.name}
      </span>
    );
  }
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
