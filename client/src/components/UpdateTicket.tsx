import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { type Ticket } from "core/constants/ticket.ts";
import { ticketTypes, ticketTypeLabel } from "core/constants/ticket-type.ts";
import { AlertTriangle, CheckCircle, Tag, BarChart2, Users, Clock, Server } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { agentTicketStatuses, statusLabel } from "core/constants/ticket-status.ts";
import { ticketCategories, categoryLabel } from "core/constants/ticket-category.ts";
import { ticketPriorities, priorityLabel } from "core/constants/ticket-priority.ts";
import { ticketSeverities, severityLabel } from "core/constants/ticket-severity.ts";
import { ticketImpacts, impactLabel } from "core/constants/ticket-impact.ts";
import { ticketUrgencies, urgencyLabel } from "core/constants/ticket-urgency.ts";
import SearchableSelect from "@/components/SearchableSelect";
import EscalateDialog from "@/components/EscalateDialog";

// ── Colour maps ───────────────────────────────────────────────────────────────

const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-green-500",
};

const STATUS_DOT: Record<string, string> = {
  open: "bg-pink-400",
  in_progress: "bg-violet-500",
  resolved: "bg-emerald-500",
  closed: "bg-muted-foreground/40",
};

const SEV_DOT: Record<string, string> = {
  sev1: "bg-red-500",
  sev2: "bg-orange-500",
  sev3: "bg-amber-500",
  sev4: "bg-green-500",
};

const LEVEL_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-green-500",
};

function dot(cls: string) {
  return <span className={`h-2 w-2 rounded-full shrink-0 ${cls}`} />;
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

// ── Section card ──────────────────────────────────────────────────────────────

function SidebarSection({
  icon: Icon, title, children,
}: {
  icon: React.ElementType; title: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/50 bg-muted/20">
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          {title}
        </span>
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        {label}
      </p>
      {children}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface Agent { id: string; name: string; }
interface CustomStatusConfig { id: number; label: string; color: string; workflowState: string; isActive: boolean; }
interface CustomTicketTypeConfig { id: number; name: string; slug: string; color: string; isActive: boolean; }
interface Team { id: number; name: string; color: string; members: Agent[]; }

function AffectedSystemInput({ ticket, onSave }: { ticket: Ticket; onSave: (val: string | null) => void; }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 h-9">
      <Server className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <Input
        ref={ref}
        size={1}
        defaultValue={ticket.affectedSystem ?? ""}
        placeholder="e.g. Payment gateway"
        className="h-7 text-sm border-0 p-0 shadow-none focus-visible:ring-0"
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
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function UpdateTicket({ ticket }: { ticket: Ticket }) {
  const queryClient = useQueryClient();
  const [escalateDialogOpen, setEscalateDialogOpen] = useState(false);

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: Agent[] }>("/api/agents");
      return data.agents;
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

  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await axios.patch(`/api/tickets/${ticket.id}`, body);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ticket", String(ticket.id)] }),
  });

  const activeCustomTicketTypes = (customTicketTypesData ?? []).filter((t) => t.isActive);
  const selectedTeam = teamsData?.find((t) => t.id === ticket.teamId) ?? null;
  const availableAgents: Agent[] =
    selectedTeam && selectedTeam.members.length > 0
      ? selectedTeam.members
      : agentsData ?? [];

  function handleTeamChange(value: string) {
    const newTeamId = value === "none" ? null : Number(value);
    const newTeam = teamsData?.find((t) => t.id === newTeamId) ?? null;
    const assigneeInNewTeam =
      !newTeam ||
      newTeam.members.length === 0 ||
      newTeam.members.some((m) => m.id === ticket.assignedTo?.id);
    const update: Record<string, unknown> = { teamId: newTeamId };
    if (ticket.assignedTo && !assigneeInNewTeam) update.assignedToId = null;
    updateMutation.mutate(update);
  }

  // ── Build options ────────────────────────────────────────────────────────

  const statusOptions = [
    ...agentTicketStatuses.map((s) => ({
      value: s,
      label: statusLabel[s],
      prefix: dot(STATUS_DOT[s] ?? "bg-muted-foreground/40"),
    })),
    ...(customStatusesData ?? [])
      .filter((cs) => cs.isActive)
      .map((cs) => ({
        value: `custom_${cs.id}`,
        label: cs.label,
        prefix: dot(""),
      })),
  ];

  const categoryOptions = [
    { value: "none", label: "None" },
    ...ticketCategories.map((c) => ({ value: c, label: categoryLabel[c] })),
  ];

  const typeValue =
    ticket.customTicketTypeId != null
      ? `custom_${ticket.customTicketTypeId}`
      : ticket.ticketType ?? "none";

  const typeOptions = [
    { value: "none", label: "Generic" },
    ...ticketTypes.map((t) => ({ value: t, label: ticketTypeLabel[t] })),
    ...activeCustomTicketTypes.map((t) => ({ value: `custom_${t.id}`, label: t.name })),
  ];

  const priorityOptions = [
    { value: "none", label: "None" },
    ...ticketPriorities.map((p) => ({
      value: p,
      label: priorityLabel[p],
      prefix: dot(PRIORITY_DOT[p] ?? "bg-muted-foreground/40"),
    })),
  ];

  const severityOptions = [
    { value: "none", label: "None" },
    ...ticketSeverities.map((s) => ({
      value: s,
      label: severityLabel[s],
      prefix: dot(SEV_DOT[s] ?? "bg-muted-foreground/40"),
    })),
  ];

  const impactOptions = [
    { value: "none", label: "None" },
    ...ticketImpacts.map((i) => ({
      value: i,
      label: impactLabel[i],
      prefix: dot(LEVEL_DOT[i] ?? "bg-muted-foreground/40"),
    })),
  ];

  const urgencyOptions = [
    { value: "none", label: "None" },
    ...ticketUrgencies.map((u) => ({
      value: u,
      label: urgencyLabel[u],
      prefix: dot(LEVEL_DOT[u] ?? "bg-muted-foreground/40"),
    })),
  ];

  const teamOptions = [
    { value: "none", label: "No team" },
    ...(teamsData ?? []).map((t) => ({
      value: String(t.id),
      label: t.name,
      prefix: <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />,
    })),
  ];

  const agentOptions = [
    { value: "unassigned", label: "Unassigned" },
    ...availableAgents.map((a) => ({
      value: a.id,
      label: a.name,
      prefix: (
        <span className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-semibold text-primary shrink-0">
          {initials(a.name)}
        </span>
      ),
    })),
  ];

  const statusValue =
    ticket.customStatusId != null ? `custom_${ticket.customStatusId}` : ticket.status;

  function handleTypeChange(value: string) {
    if (value === "none") updateMutation.mutate({ ticketType: null, customTicketTypeId: null });
    else if (value.startsWith("custom_"))
      updateMutation.mutate({ ticketType: null, customTicketTypeId: parseInt(value.replace("custom_", ""), 10) });
    else updateMutation.mutate({ ticketType: value, customTicketTypeId: null });
  }

  function handleStatusChange(value: string) {
    if (value.startsWith("custom_")) {
      const id = parseInt(value.replace("custom_", ""), 10);
      updateMutation.mutate({ customStatusId: id });
    } else {
      updateMutation.mutate({ status: value, customStatusId: null });
    }
  }

  return (
    <div className="space-y-3">

      {/* ── Details ── */}
      <SidebarSection icon={Tag} title="Details">
        <FieldRow label="Status">
          <SearchableSelect
            value={statusValue}
            onChange={handleStatusChange}
            options={statusOptions}
            disabled={updateMutation.isPending}
          />
        </FieldRow>
        <FieldRow label="Category">
          <SearchableSelect
            value={ticket.category ?? "none"}
            onChange={(val) => updateMutation.mutate({ category: val === "none" ? null : val })}
            options={categoryOptions}
            disabled={updateMutation.isPending}
          />
        </FieldRow>
        <FieldRow label="Type">
          <SearchableSelect
            value={typeValue}
            onChange={handleTypeChange}
            options={typeOptions}
            disabled={updateMutation.isPending}
          />
        </FieldRow>
        {ticket.ticketType === "incident" && (
          <FieldRow label="Affected System">
            <AffectedSystemInput
              ticket={ticket}
              onSave={(val) => updateMutation.mutate({ affectedSystem: val })}
            />
          </FieldRow>
        )}
      </SidebarSection>

      {/* ── Triage ── */}
      <SidebarSection icon={BarChart2} title="Triage">
        <FieldRow label="Priority">
          <SearchableSelect
            value={ticket.priority ?? "none"}
            onChange={(val) => updateMutation.mutate({ priority: val === "none" ? null : val })}
            options={priorityOptions}
            disabled={updateMutation.isPending}
          />
        </FieldRow>
        <FieldRow label="Severity">
          <SearchableSelect
            value={ticket.severity ?? "none"}
            onChange={(val) => updateMutation.mutate({ severity: val === "none" ? null : val })}
            options={severityOptions}
            disabled={updateMutation.isPending}
          />
        </FieldRow>
        <FieldRow label="Impact">
          <SearchableSelect
            value={ticket.impact ?? "none"}
            onChange={(val) => updateMutation.mutate({ impact: val === "none" ? null : val })}
            options={impactOptions}
            disabled={updateMutation.isPending}
          />
        </FieldRow>
        <FieldRow label="Urgency">
          <SearchableSelect
            value={ticket.urgency ?? "none"}
            onChange={(val) => updateMutation.mutate({ urgency: val === "none" ? null : val })}
            options={urgencyOptions}
            disabled={updateMutation.isPending}
          />
        </FieldRow>
      </SidebarSection>

      {/* ── Routing ── */}
      <SidebarSection icon={Users} title="Routing">
        <FieldRow label="Team">
          <SearchableSelect
            value={ticket.teamId != null ? String(ticket.teamId) : "none"}
            onChange={handleTeamChange}
            options={teamOptions}
            disabled={updateMutation.isPending}
          />
        </FieldRow>
        <FieldRow label={selectedTeam ? `Agent · ${selectedTeam.name}` : "Agent"}>
          <SearchableSelect
            value={ticket.assignedTo?.id ?? "unassigned"}
            onChange={(val) => updateMutation.mutate({ assignedToId: val === "unassigned" ? null : val })}
            options={agentOptions}
            disabled={updateMutation.isPending}
          />
          {selectedTeam && selectedTeam.members.length === 0 && (
            <p className="text-[10px] text-muted-foreground mt-1">This team has no members yet.</p>
          )}
        </FieldRow>

        <div className="pt-1 border-t border-border/40 space-y-2">
          {ticket.isEscalated ? (
            <>
              {/* Escalation target summary */}
              {(ticket.escalatedToTeam || ticket.escalatedToUser) && (
                <div className="rounded-lg bg-destructive/5 border border-destructive/20 px-3 py-2 text-xs space-y-0.5">
                  <p className="font-semibold text-destructive text-[10px] uppercase tracking-wider mb-1">Escalated to</p>
                  {ticket.escalatedToTeam && (
                    <p className="text-muted-foreground flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: ticket.escalatedToTeam.color }} />
                      {ticket.escalatedToTeam.name}
                    </p>
                  )}
                  {ticket.escalatedToUser && (
                    <p className="text-muted-foreground flex items-center gap-1.5">
                      <span className="h-4 w-4 rounded-full bg-primary/10 text-primary text-[9px] font-bold flex items-center justify-center shrink-0">
                        {ticket.escalatedToUser.name.charAt(0)}
                      </span>
                      {ticket.escalatedToUser.name}
                    </p>
                  )}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 text-muted-foreground"
                disabled={updateMutation.isPending}
                onClick={() => updateMutation.mutate({ escalate: false })}
              >
                <CheckCircle className="h-3.5 w-3.5" />
                De-escalate
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive hover:border-destructive/50"
              disabled={updateMutation.isPending}
              onClick={() => setEscalateDialogOpen(true)}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Escalate
            </Button>
          )}
        </div>

        {/* Escalation dialog */}
        <EscalateDialog
          open={escalateDialogOpen}
          ticketSubject={ticket.subject}
          onClose={() => setEscalateDialogOpen(false)}
          isPending={updateMutation.isPending}
          onConfirm={({ escalateToTeamId, escalateToUserId }) => {
            updateMutation.mutate(
              { escalate: true, escalateToTeamId, escalateToUserId } as Parameters<typeof updateMutation.mutate>[0],
              { onSuccess: () => setEscalateDialogOpen(false) },
            );
          }}
        />
      </SidebarSection>

      {/* ── Dates ── */}
      <SidebarSection icon={Clock} title="Dates">
        {[
          { label: "Created", value: ticket.createdAt },
          { label: "Updated", value: ticket.updatedAt },
          ...(ticket.resolvedAt ? [{ label: "Resolved", value: ticket.resolvedAt }] : []),
        ].map((row) => (
          <div key={row.label} className="flex justify-between text-xs">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="font-medium">
              {new Intl.DateTimeFormat(undefined, {
                month: "short", day: "numeric",
                hour: "2-digit", minute: "2-digit", timeZoneName: "short",
              }).format(new Date(row.value))}
            </span>
          </div>
        ))}
      </SidebarSection>

    </div>
  );
}
