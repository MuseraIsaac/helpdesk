import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { type Ticket } from "core/constants/ticket.ts";
import { AlertTriangle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { agentTicketStatuses, statusLabel } from "core/constants/ticket-status.ts";
import { ticketCategories, categoryLabel } from "core/constants/ticket-category.ts";
import { ticketPriorities, priorityLabel } from "core/constants/ticket-priority.ts";
import { ticketSeverities, severityLabel } from "core/constants/ticket-severity.ts";
import { ticketImpacts, impactLabel } from "core/constants/ticket-impact.ts";
import { ticketUrgencies, urgencyLabel } from "core/constants/ticket-urgency.ts";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Agent {
  id: string;
  name: string;
}

interface UpdateTicketProps {
  ticket: Ticket;
}

function SidebarLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </span>
  );
}

export default function UpdateTicket({ ticket }: UpdateTicketProps) {
  const queryClient = useQueryClient();

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: Agent[] }>("/api/agents");
      return data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await axios.patch(`/api/tickets/${ticket.id}`, body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", String(ticket.id)] });
    },
  });

  return (
    <Card className="w-56 h-fit">
      <CardContent className="pt-5 space-y-5">

        {/* Triage section */}
        <div className="space-y-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Triage
          </p>

          <div className="space-y-1.5">
            <SidebarLabel>Priority</SidebarLabel>
            <Select
              value={ticket.priority ?? "none"}
              onValueChange={(value) =>
                updateMutation.mutate({ priority: value === "none" ? null : value })
              }
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {ticketPriorities.map((p) => (
                  <SelectItem key={p} value={p}>
                    {priorityLabel[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <SidebarLabel>Severity</SidebarLabel>
            <Select
              value={ticket.severity ?? "none"}
              onValueChange={(value) =>
                updateMutation.mutate({ severity: value === "none" ? null : value })
              }
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {ticketSeverities.map((s) => (
                  <SelectItem key={s} value={s}>
                    {severityLabel[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <SidebarLabel>Impact</SidebarLabel>
            <Select
              value={ticket.impact ?? "none"}
              onValueChange={(value) =>
                updateMutation.mutate({ impact: value === "none" ? null : value })
              }
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {ticketImpacts.map((i) => (
                  <SelectItem key={i} value={i}>
                    {impactLabel[i]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <SidebarLabel>Urgency</SidebarLabel>
            <Select
              value={ticket.urgency ?? "none"}
              onValueChange={(value) =>
                updateMutation.mutate({ urgency: value === "none" ? null : value })
              }
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {ticketUrgencies.map((u) => (
                  <SelectItem key={u} value={u}>
                    {urgencyLabel[u]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border-t" />

        {/* Escalation section */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Escalation
          </p>
          {ticket.isEscalated ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-muted-foreground"
              disabled={updateMutation.isPending}
              onClick={() => updateMutation.mutate({ escalate: false })}
            >
              <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
              De-escalate
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600"
              disabled={updateMutation.isPending}
              onClick={() => updateMutation.mutate({ escalate: true })}
            >
              <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
              Escalate
            </Button>
          )}
        </div>

        <div className="border-t" />

        {/* Details section */}
        <div className="space-y-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Details
          </p>

          <div className="space-y-1.5">
            <SidebarLabel>Status</SidebarLabel>
            <Select
              value={ticket.status}
              onValueChange={(value) => updateMutation.mutate({ status: value })}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {agentTicketStatuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabel[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <SidebarLabel>Category</SidebarLabel>
            <Select
              value={ticket.category ?? "none"}
              onValueChange={(value) =>
                updateMutation.mutate({ category: value === "none" ? null : value })
              }
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {ticketCategories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {categoryLabel[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <SidebarLabel>Assigned To</SidebarLabel>
            <Select
              value={ticket.assignedTo?.id ?? "unassigned"}
              onValueChange={(value) =>
                updateMutation.mutate({
                  assignedToId: value === "unassigned" ? null : value,
                })
              }
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {agentsData?.agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
