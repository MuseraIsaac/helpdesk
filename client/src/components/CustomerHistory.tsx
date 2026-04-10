import { Link } from "react-router";
import { type CustomerSummary } from "core/constants/customer.ts";
import { statusLabel, statusVariant } from "core/constants/ticket-status.ts";
import { type TicketStatus } from "core/constants/ticket-status.ts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Building2, Mail, Ticket } from "lucide-react";

interface CustomerHistoryProps {
  customer: CustomerSummary;
  currentTicketId: number;
}

export default function CustomerHistory({ customer, currentTicketId }: CustomerHistoryProps) {
  const otherTickets = customer.recentTickets.filter((t) => t.id !== currentTicketId);

  return (
    <Card className="w-[280px]">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
          Customer
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {/* Identity */}
        <div className="space-y-1.5">
          <p className="text-sm font-medium leading-tight">{customer.name}</p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{customer.email}</span>
          </div>
          {customer.organization && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{customer.organization.name}</span>
              {customer.organization.domain && (
                <span className="text-muted-foreground/60">({customer.organization.domain})</span>
              )}
            </div>
          )}
          {customer.notes && (
            <p className="text-xs text-muted-foreground italic border-l-2 pl-2 mt-1">
              {customer.notes}
            </p>
          )}
        </div>

        {/* Ticket history */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Ticket className="h-3 w-3 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground">
              {otherTickets.length === 0
                ? "No prior tickets"
                : `${otherTickets.length} prior ticket${otherTickets.length === 1 ? "" : "s"}`}
            </p>
          </div>

          {otherTickets.length > 0 && (
            <div className="space-y-1.5">
              {otherTickets.map((t) => (
                <Link
                  key={t.id}
                  to={`/tickets/${t.id}`}
                  className="block rounded-md border px-2.5 py-2 hover:bg-accent transition-colors"
                >
                  <p className="text-xs font-medium truncate leading-snug mb-1">{t.subject}</p>
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant={statusVariant[t.status as TicketStatus] ?? "outline"}
                      className="text-[10px] h-4 px-1.5"
                    >
                      {statusLabel[t.status as TicketStatus] ?? t.status}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      #{t.id}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
