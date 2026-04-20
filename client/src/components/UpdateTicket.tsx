import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { type Ticket } from "core/constants/ticket.ts";
import { ticketTypes, ticketTypeLabel } from "core/constants/ticket-type.ts";
import { AlertTriangle, CheckCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
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

interface CustomStatusConfig {
  id: number;
  label: string;
  color: string;
  workflowState: string;
  isActive: boolean;
}

interface CustomTicketTypeConfig {
  id: number;
  name: string;
  slug: string;
  color: string;
  isActive: boolean;
}

interface Team {
  id: number;
  name: string;
  color: string;
  members: Agent[];
}

interface UpdateTicketProps {
  ticket: Ticket;
}

function AffectedSystemInput({
  ticket,
  onSave,
}: {
  ticket: Ticket;
  onSave: (val: string | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <Input
      ref={ref}
      size={1}
      defaultValue={ticket.affectedSystem ?? ""}
      placeholder="e.g. Payment gateway"
      className="h-7 text-xs"
      onBlur={(e) => {
        const val = e.target.value.trim();
        const prev = ticket.affectedSystem ?? "";
        if (val !== prev) onSave(val || null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") ref.current?.blur();
        if (e.key === "Escape") {
          if (ref.current) ref.current.value = ticket.affectedSystem ?? "";
          ref.current?.blur();
        }
      }}
    />
  );
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

  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data } = await axios.get<{ teams: Team[] }>("/api/teams");
      return data.teams;
    },
  });

  const { data: customStatusesData } = useQuery({
    queryKey: ["ticket-status-configs"],
    queryFn: async () => {
      const { data } = await axios.get<{ configs: CustomStatusConfig[] }>("/api/ticket-status-configs");
      return data.configs;
    },
  });

  const { data: customTicketTypesData } = useQuery({
    queryKey: ["ticket-types"],
    queryFn: async () => {
      const { data } = await axios.get<{ ticketTypes: CustomTicketTypeConfig[] }>("/api/ticket-types");
      return data.ticketTypes;
    },
  });
  const activeCustomTicketTypes = (customTicketTypesData ?? []).filter((t) => t.isActive);

  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await axios.patch(`/api/tickets/${ticket.id}`, body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", String(ticket.id)] });
    },
  });

  // Agents available to assign: filtered to the selected team's members.
  // Falls back to all agents when no team is selected.
  const selectedTeam = teamsData?.find((t) => t.id === ticket.teamId) ?? null;
  const availableAgents: Agent[] =
    selectedTeam && selectedTeam.members.length > 0
      ? selectedTeam.members
      : agentsData?.agents ?? [];

  function handleTeamChange(value: string) {
    const newTeamId = value === "none" ? null : Number(value);
    const newTeam = teamsData?.find((t) => t.id === newTeamId) ?? null;

    // If the current assignee isn't a member of the new team, clear them
    const assigneeInNewTeam =
      !newTeam ||
      newTeam.members.length === 0 ||
      newTeam.members.some((m) => m.id === ticket.assignedTo?.id);

    const update: Record<string, unknown> = { teamId: newTeamId };
    if (ticket.assignedTo && !assigneeInNewTeam) {
      update.assignedToId = null;
    }
    updateMutation.mutate(update);
  }

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
            <SidebarLabel>Type</SidebarLabel>
            <Select
              value={
                ticket.customTicketTypeId != null
                  ? `custom_${ticket.customTicketTypeId}`
                  : ticket.ticketType ?? "none"
              }
              onValueChange={(value) => {
                if (value === "none") {
                  updateMutation.mutate({ ticketType: null, customTicketTypeId: null });
                } else if (value.startsWith("custom_")) {
                  updateMutation.mutate({ ticketType: null, customTicketTypeId: parseInt(value.replace("custom_", ""), 10) });
                } else {
                  updateMutation.mutate({ ticketType: value, customTicketTypeId: null });
                }
              }}
              disabled={updateMutation.isPending}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="Generic" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Generic</SelectItem>
                {ticketTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ticketTypeLabel[t]}
                  </SelectItem>
                ))}
                {activeCustomTicketTypes.map((t) => (
                  <SelectItem key={`custom_${t.id}`} value={`custom_${t.id}`}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {ticket.ticketType === "incident" && (
            <div className="space-y-1.5">
              <SidebarLabel>Affected System</SidebarLabel>
              <AffectedSystemInput ticket={ticket} onSave={(val) => updateMutation.mutate({ affectedSystem: val })} />
            </div>
          )}

          <div className="space-y-1.5">
            <SidebarLabel>Status</SidebarLabel>
            <Select
              value={ticket.customStatusId != null ? `custom_${ticket.customStatusId}` : ticket.status}
              onValueChange={(value) => {
                if (value.startsWith("custom_")) {
                  const id = parseInt(value.replace("custom_", ""), 10);
                  updateMutation.mutate({ customStatusId: id });
                } else {
                  updateMutation.mutate({ status: value, customStatusId: null });
                }
              }}
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
                {(customStatusesData ?? [])
                  .filter((cs) => cs.isActive)
                  .map((cs) => (
                    <SelectItem key={`custom_${cs.id}`} value={`custom_${cs.id}`}>
                      {cs.label}
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

          {/* Team — select first; agent list is scoped to team members */}
          <div className="space-y-1.5">
            <SidebarLabel>Team</SidebarLabel>
            <Select
              value={ticket.teamId != null ? String(ticket.teamId) : "none"}
              onValueChange={handleTeamChange}
              disabled={updateMutation.isPending}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="No team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No team</SelectItem>
                {(teamsData ?? []).map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: t.color }}
                      />
                      {t.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Agent — scoped to team members once a team is selected */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <SidebarLabel>Assigned Agent</SidebarLabel>
              {selectedTeam && (
                <span className="text-[10px] text-muted-foreground">{selectedTeam.name}</span>
              )}
            </div>
            <Select
              value={ticket.assignedTo?.id ?? "unassigned"}
              onValueChange={(value) =>
                updateMutation.mutate({
                  assignedToId: value === "unassigned" ? null : value,
                })
              }
              disabled={updateMutation.isPending}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {availableAgents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTeam && selectedTeam.members.length === 0 && (
              <p className="text-[10px] text-muted-foreground">
                This team has no members yet.
              </p>
            )}
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
