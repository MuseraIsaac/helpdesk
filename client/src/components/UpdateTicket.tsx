import { useRef, useState, useEffect } from "react";
import { useParams } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { type Ticket } from "core/constants/ticket.ts";
import { ticketTypes, ticketTypeLabel } from "core/constants/ticket-type.ts";
import { AlertTriangle, CheckCircle, Tag, BarChart2, Users, Clock, Server, Save, Undo2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
//
// Each sidebar section gets a distinctive — but tastefully muted — color
// theme so users can visually scan the right rail. Themes are designed to
// read as a unified palette (all low-saturation tints over the card BG)
// rather than rainbow accents that fight for attention.

type SectionTheme = {
  /** Header gradient + bottom border accent */
  header: string;
  /** Icon container background + border */
  iconBg: string;
  /** Icon foreground colour */
  iconColor: string;
  /** Section title text colour */
  titleColor: string;
  /** Left rail accent stripe at the top edge */
  rail: string;
};

const SECTION_THEMES: Record<string, SectionTheme> = {
  // Indigo — neutral overview / classification
  Details: {
    header:     "bg-gradient-to-r from-indigo-500/[0.08] via-indigo-500/[0.03] to-transparent border-b-indigo-500/15",
    iconBg:     "bg-indigo-500/10 border-indigo-500/25",
    iconColor:  "text-indigo-600 dark:text-indigo-400",
    titleColor: "text-indigo-700/90 dark:text-indigo-300/90",
    rail:       "bg-indigo-500/60",
  },
  // Amber — triage decisions, attention-grabbing
  Triage: {
    header:     "bg-gradient-to-r from-amber-500/[0.10] via-amber-500/[0.04] to-transparent border-b-amber-500/15",
    iconBg:     "bg-amber-500/10 border-amber-500/25",
    iconColor:  "text-amber-600 dark:text-amber-400",
    titleColor: "text-amber-700/90 dark:text-amber-300/90",
    rail:       "bg-amber-500/60",
  },
  // Emerald — assignment / human routing
  Routing: {
    header:     "bg-gradient-to-r from-emerald-500/[0.08] via-emerald-500/[0.03] to-transparent border-b-emerald-500/15",
    iconBg:     "bg-emerald-500/10 border-emerald-500/25",
    iconColor:  "text-emerald-600 dark:text-emerald-400",
    titleColor: "text-emerald-700/90 dark:text-emerald-300/90",
    rail:       "bg-emerald-500/60",
  },
  // Sky — time, schedule, calendar
  Dates: {
    header:     "bg-gradient-to-r from-sky-500/[0.08] via-sky-500/[0.03] to-transparent border-b-sky-500/15",
    iconBg:     "bg-sky-500/10 border-sky-500/25",
    iconColor:  "text-sky-600 dark:text-sky-400",
    titleColor: "text-sky-700/90 dark:text-sky-300/90",
    rail:       "bg-sky-500/60",
  },
};

const DEFAULT_THEME: SectionTheme = {
  header:     "bg-gradient-to-r from-muted/40 via-muted/15 to-transparent border-b-border/50",
  iconBg:     "bg-muted border-border/60",
  iconColor:  "text-muted-foreground",
  titleColor: "text-muted-foreground/80",
  rail:       "bg-muted-foreground/20",
};

function SidebarSection({
  icon: Icon, title, children,
}: {
  icon: React.ElementType; title: string; children: React.ReactNode;
}) {
  const theme = SECTION_THEMES[title] ?? DEFAULT_THEME;
  return (
    <div className="relative rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
      {/* Top-edge color rail — subtle but visible signature for the section */}
      <div className={`absolute top-0 inset-x-0 h-[3px] ${theme.rail}`} />
      <div className={`flex items-center gap-2.5 px-4 py-3 border-b ${theme.header}`}>
        <span className={`flex h-6 w-6 items-center justify-center rounded-md border shrink-0 ${theme.iconBg}`}>
          <Icon className={`h-3.5 w-3.5 ${theme.iconColor}`} />
        </span>
        <span className={`text-[11px] font-bold uppercase tracking-widest ${theme.titleColor}`}>
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

function AffectedSystemInput({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (val: string | null) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // Local draft so users can type freely; we commit to the parent's pending
  // state on blur (or Enter), and revert with Escape.
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => { setDraft(value ?? ""); }, [value]);

  return (
    <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 h-9">
      <Server className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <Input
        ref={ref}
        size={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={disabled}
        placeholder="e.g. Payment gateway"
        className="h-7 text-sm border-0 p-0 shadow-none focus-visible:ring-0"
        onBlur={() => {
          const val = draft.trim();
          const prev = value ?? "";
          if (val !== prev) onChange(val || null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") ref.current?.blur();
          if (e.key === "Escape") {
            setDraft(value ?? "");
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
  const { data: session } = useSession();
  const currentUserId   = session?.user?.id   ?? null;
  const currentUserName = session?.user?.name ?? "";

  // The TicketDetailPage caches the ticket under `["ticket", urlId]` where
  // urlId is whatever the URL contained — could be the numeric DB id ("36")
  // or the human-readable ticket number ("DEMO-TKT-0005"). The mutation
  // needs to update that exact cache entry, otherwise saves appear to
  // "revert" on tickets opened via their human-readable number.
  const { id: urlId } = useParams<{ id: string }>();

  // ── Pending-changes buffer ───────────────────────────────────────────────
  //
  // Field edits accumulate here instead of firing a PATCH per change. The
  // sticky save bar at the top of the panel exposes how many fields are
  // dirty and lets the agent commit (or discard) them in one round-trip.
  // Escalate / De-escalate are intentionally NOT batched — they're explicit
  // workflow actions and should still feel like discrete commits.
  const [pending, setPending] = useState<Record<string, unknown>>({});
  const pendingCount = Object.keys(pending).length;
  const isDirty = pendingCount > 0;

  function queueUpdate(patch: Record<string, unknown>) {
    setPending((prev) => ({ ...prev, ...patch }));
  }
  function discardChanges() {
    setPending({});
  }
  /** Read the displayed value for a key — pending edit wins over the
   *  server-side ticket value. Uses `in` so explicit `null` (clear field) is
   *  preserved correctly. */
  function val<T>(key: string, fallback: T): T {
    return (key in pending ? (pending[key] as T) : fallback);
  }

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: Agent[] }>("/api/agents");
      return data.agents;
    },
    refetchOnWindowFocus: true,
  });

  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data } = await axios.get<{ teams: Team[] }>("/api/teams");
      return data.teams;
    },
    refetchOnWindowFocus: true,
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

  // Apply an in-flight patch onto a ticket, mirroring the fields the sidebar
  // dropdowns can mutate. Mapped relations (team, customStatus, customTicketType,
  // assignedTo) are derived from the *Id fields plus the relevant lookup data
  // so the UI updates immediately without waiting for the server round-trip.
  function applyOptimisticPatch(prev: Ticket, patch: Record<string, unknown>): Ticket {
    const next: Ticket = { ...prev };
    for (const [k, v] of Object.entries(patch)) {
      (next as Record<string, unknown>)[k] = v;
    }
    if ("teamId" in patch) {
      const id = patch.teamId as number | null | undefined;
      const team = id == null ? null : teamsData?.find((t) => t.id === id) ?? null;
      (next as Record<string, unknown>).team = team
        ? { id: team.id, name: team.name, color: team.color }
        : null;
    }
    if ("assignedToId" in patch) {
      const id = patch.assignedToId as string | null | undefined;
      const agent = id == null ? null : agentsData?.find((a) => a.id === id) ?? null;
      (next as Record<string, unknown>).assignedTo = agent
        ? { id: agent.id, name: agent.name }
        : null;
    }
    if ("customStatusId" in patch) {
      const id = patch.customStatusId as number | null | undefined;
      const cs = id == null ? null : customStatusesData?.find((c) => c.id === id) ?? null;
      (next as Record<string, unknown>).customStatus = cs
        ? { id: cs.id, label: cs.label, color: cs.color }
        : null;
      if (cs) (next as Record<string, unknown>).status = cs.workflowState;
    }
    if ("customTicketTypeId" in patch) {
      const id = patch.customTicketTypeId as number | null | undefined;
      const ct = id == null ? null : customTicketTypesData?.find((c) => c.id === id) ?? null;
      (next as Record<string, unknown>).customTicketType = ct
        ? { id: ct.id, name: ct.name, slug: ct.slug, color: ct.color }
        : null;
    }
    return next;
  }

  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await axios.patch<Ticket>(`/api/tickets/${ticket.id}`, body);
      return data;
    },
    // Optimistic update — write the patched ticket to the cache *before* the
    // request fires, so dropdowns reflect the new selection instantly. The
    // server's authoritative response replaces the optimistic value on success;
    // on error we roll back to the pre-mutation snapshot.
    onMutate: async (patch) => {
      // Include every cache key the ticket could be under: the numeric id as
      // both string and number form, plus the URL slug that the page-level
      // query was actually keyed by (e.g. "DEMO-TKT-0005"). Without the
      // urlId entry, saves on tickets opened via their human-readable number
      // would write to a different cache than the page is reading from, and
      // fields would appear to revert on success.
      const keys: (readonly [string, string | number])[] = [
        ["ticket", String(ticket.id)] as const,
        ["ticket", ticket.id] as const,
      ];
      if (urlId && urlId !== String(ticket.id)) {
        keys.push(["ticket", urlId] as const);
      }
      await Promise.all(
        keys.map((k) => queryClient.cancelQueries({ queryKey: k })),
      );
      const previous = keys.map((k) => [k, queryClient.getQueryData<Ticket>(k)] as const);
      for (const [k] of previous) {
        queryClient.setQueryData<Ticket>(k, (old) =>
          old ? applyOptimisticPatch(old, patch) : old,
        );
      }
      return { previous };
    },
    onError: (_err, _patch, ctx) => {
      if (!ctx) return;
      for (const [k, snapshot] of ctx.previous) {
        if (snapshot) queryClient.setQueryData(k, snapshot);
      }
    },
    onSuccess: (updated) => {
      // Replace the optimistic value with the server's authoritative response
      // on every cache key the ticket might live under.
      queryClient.setQueryData(["ticket", String(ticket.id)], updated);
      queryClient.setQueryData(["ticket", ticket.id], updated);
      if (urlId && urlId !== String(ticket.id)) {
        queryClient.setQueryData(["ticket", urlId], updated);
      }
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  function saveChanges() {
    if (!isDirty) return;
    updateMutation.mutate(pending, {
      onSuccess: () => setPending({}),
    });
  }

  const activeCustomTicketTypes = (customTicketTypesData ?? []).filter((t) => t.isActive);
  // Merged values — pending edits override the server snapshot so the UI
  // reflects what the user has queued, not what's persisted.
  const mergedTeamId        = val<number | null>("teamId", ticket.teamId ?? null);
  const mergedAssignedToId  = val<string | null>("assignedToId", ticket.assignedTo?.id ?? null);
  const mergedCategory      = val<string | null>("category", ticket.category ?? null);
  const mergedAffectedSys   = val<string | null>("affectedSystem", ticket.affectedSystem ?? null);
  const mergedPriority      = val<string | null>("priority", ticket.priority ?? null);
  const mergedSeverity      = val<string | null>("severity", ticket.severity ?? null);
  const mergedImpact        = val<string | null>("impact", ticket.impact ?? null);
  const mergedUrgency       = val<string | null>("urgency", ticket.urgency ?? null);
  const mergedTicketType    = val<string | null>("ticketType", ticket.ticketType ?? null);
  const mergedCustomTypeId  = val<number | null>("customTicketTypeId", ticket.customTicketTypeId ?? null);
  const mergedCustomStatusId = val<number | null>("customStatusId", ticket.customStatusId ?? null);
  const mergedStatus        = val<string>("status", ticket.status);

  const selectedTeam = teamsData?.find((t) => t.id === mergedTeamId) ?? null;
  const availableAgents: Agent[] = selectedTeam
    ? selectedTeam.members
    : agentsData ?? [];

  function handleTeamChange(value: string) {
    const newTeamId = value === "none" ? null : Number(value);
    const newTeam = teamsData?.find((t) => t.id === newTeamId) ?? null;
    const currentAssigneeId = val<string | null>(
      "assignedToId",
      ticket.assignedTo?.id ?? null,
    );
    const assigneeInNewTeam =
      !newTeam ||
      newTeam.members.some((m) => m.id === currentAssigneeId);
    const patch: Record<string, unknown> = { teamId: newTeamId };
    if (currentAssigneeId && !assigneeInNewTeam) patch.assignedToId = null;
    queueUpdate(patch);
  }

  // ── Agent → team auto-population ──────────────────────────────────────────
  //
  // When an agent is assigned, surface the team(s) they belong to:
  //   • 0 teams: leave team as-is, just stamp the assignee.
  //   • 1 team:  auto-set that team alongside the assignee.
  //   • 2+ teams AND the current team is one of them: keep the current
  //                team (no surprise switch) and just stamp the assignee.
  //   • 2+ teams AND the current team is NOT one of them: open the
  //                team-picker dialog so the user explicitly chooses
  //                which team this assignment belongs to.

  /** Picker state — null while no choice is being prompted for. */
  const [teamPicker, setTeamPicker] = useState<{
    agentId:   string;
    agentName: string;
    teams:     Team[];
  } | null>(null);

  function handleAgentChange(value: string) {
    const newAgentId = value === "unassigned" ? null : value;

    // Unassigning — never touch the team. Just clear the agent.
    if (newAgentId === null) {
      queueUpdate({ assignedToId: null });
      return;
    }

    const agentTeams = (teamsData ?? []).filter((t) =>
      t.members.some((m) => m.id === newAgentId),
    );

    if (agentTeams.length === 0) {
      // Agent isn't on any team — clear the team along with the
      // assignment. Leaving the previous agent's team in place was
      // misleading: the new agent has nothing to do with that team and
      // the SLA / watcher routing would silently still belong to it.
      queueUpdate({ assignedToId: newAgentId, teamId: null });
      return;
    }

    if (agentTeams.length === 1) {
      // Exactly one team — auto-set both fields.
      queueUpdate({ assignedToId: newAgentId, teamId: agentTeams[0]!.id });
      return;
    }

    // Multiple teams — keep current team if the agent is already in it,
    // otherwise prompt the user to pick.
    const currentTeamId = val<number | null>("teamId", ticket.teamId ?? null);
    if (currentTeamId != null && agentTeams.some((t) => t.id === currentTeamId)) {
      queueUpdate({ assignedToId: newAgentId });
      return;
    }

    const agentName = (agentsData ?? []).find((a) => a.id === newAgentId)?.name ?? "this agent";
    setTeamPicker({ agentId: newAgentId, agentName, teams: agentTeams });
  }

  function confirmTeamPicker(teamId: number) {
    if (!teamPicker) return;
    queueUpdate({ assignedToId: teamPicker.agentId, teamId });
    setTeamPicker(null);
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
    mergedCustomTypeId != null
      ? `custom_${mergedCustomTypeId}`
      : mergedTicketType ?? "none";

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

  // Agent options: when a team is selected we group "In <team>" first,
  // followed by "Other agents" so the user can still pick someone from
  // another team — picking a cross-team agent triggers the team-picker
  // prompt above, which is the whole point of the auto-population flow.
  const agentRow = (a: Agent) => ({
    value: a.id,
    label: a.name,
    prefix: (
      <span className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-semibold text-primary shrink-0">
        {initials(a.name)}
      </span>
    ),
  });

  // "Me" shortcut — pinned at the top so an agent can self-assign in one
  // click without scrolling the agent list. Hidden when the current user
  // already owns the ticket (no point offering self-assign to yourself)
  // or when the session hasn't loaded yet.
  const meOption = currentUserId && mergedAssignedToId !== currentUserId
    ? {
        value: currentUserId,
        label: "Me",
        prefix: (
          <span
            className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-semibold text-white shrink-0 ring-1 ring-primary/30"
            style={{ background: "linear-gradient(135deg, var(--primary), var(--ring))" }}
            title={currentUserName}
          >
            {initials(currentUserName) || "?"}
          </span>
        ),
        hint: <span className="text-[9px] text-primary/70 font-semibold">assign to self</span>,
      }
    : null;

  // When a team is set, the agent dropdown is scoped to that team's
  // members only — picking the team first is a deliberate signal that
  // the user wants to stay inside it. No team set → all agents are
  // selectable so the team-auto-population flow can suggest one. The
  // "Me" pinned row stays available regardless; if "Me" isn't in the
  // selected team, picking it triggers the team-picker dialog.
  const agentOptions = (() => {
    const allAgents = agentsData ?? [];
    const head = [
      { value: "unassigned", label: "Unassigned" },
      ...(meOption ? [meOption] : []),
    ];
    if (!selectedTeam) {
      return [...head, ...allAgents.map(agentRow)];
    }
    const inTeamIds = new Set(selectedTeam.members.map((m) => m.id));
    const inTeam    = allAgents.filter((a) => inTeamIds.has(a.id));
    return [...head, ...inTeam.map(agentRow)];
  })();

  const statusValue =
    mergedCustomStatusId != null ? `custom_${mergedCustomStatusId}` : mergedStatus;

  function handleTypeChange(value: string) {
    if (value === "none") queueUpdate({ ticketType: null, customTicketTypeId: null });
    else if (value.startsWith("custom_"))
      queueUpdate({ ticketType: null, customTicketTypeId: parseInt(value.replace("custom_", ""), 10) });
    else queueUpdate({ ticketType: value, customTicketTypeId: null });
  }

  function handleStatusChange(value: string) {
    if (value.startsWith("custom_")) {
      const id = parseInt(value.replace("custom_", ""), 10);
      queueUpdate({ customStatusId: id });
    } else {
      queueUpdate({ status: value, customStatusId: null });
    }
  }

  return (
    <div className="space-y-3">

      {/* ── Save bar ─────────────────────────────────────────────────────
       *
       * Always visible at the top of the panel so the save affordance is
       * obvious. Edits are batched into local state; this bar is the user's
       * only commit point. When dirty: highlighted, both buttons enabled.
       * When clean: muted with a "All changes saved" status pill, buttons
       * disabled. */}
      <div
        className={`sticky top-0 z-10 rounded-xl border shadow-sm overflow-hidden transition-colors ${
          isDirty
            ? "border-primary/30 bg-primary/[0.05] dark:bg-primary/[0.08]"
            : "border-border bg-card"
        }`}
      >
        <div className="flex items-center gap-2 px-3 py-2.5">
          {isDirty ? (
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary shrink-0">
              <span className="text-[11px] font-bold tabular-nums">{pendingCount}</span>
            </span>
          ) : (
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
              <CheckCircle className="h-3.5 w-3.5" />
            </span>
          )}
          <p className="text-xs font-medium flex-1 min-w-0">
            {isDirty ? (
              <>
                <span className="text-foreground">Unsaved change{pendingCount === 1 ? "" : "s"}</span>
                <span className="text-muted-foreground"> — review and save below</span>
              </>
            ) : (
              <span className="text-muted-foreground">
                All changes saved
              </span>
            )}
          </p>
        </div>
        <div className={`flex items-stretch border-t ${isDirty ? "border-primary/15" : "border-border"}`}>
          <button
            type="button"
            onClick={discardChanges}
            disabled={!isDirty || updateMutation.isPending}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Discard
          </button>
          <div className={`w-px ${isDirty ? "bg-primary/15" : "bg-border"}`} />
          <button
            type="button"
            onClick={saveChanges}
            disabled={!isDirty || updateMutation.isPending}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
              isDirty
                ? "text-primary hover:bg-primary/10"
                : "text-muted-foreground"
            }`}
          >
            {updateMutation.isPending ? (
              <>
                <span className="h-3.5 w-3.5 rounded-full border-2 border-primary/40 border-t-primary animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                Save changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* Mutation feedback — surfaces a save error inline so the user
          notices when an update silently rolled back (e.g. permission
          denied, validation rejection). Without this the optimistic
          update would briefly show the new value, the onError rollback
          would revert it, and the user would conclude "the dropdown
          isn't saving" with no way to see why. */}
      {updateMutation.error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/[0.06] px-3 py-2 text-xs text-destructive flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-semibold">Couldn't save your change</p>
            <p className="text-destructive/80 break-words mt-0.5">
              {(() => {
                const e = updateMutation.error as unknown;
                if (axios.isAxiosError(e)) {
                  const data = e.response?.data as { error?: string } | undefined;
                  return data?.error ?? e.message;
                }
                return e instanceof Error ? e.message : "Unknown error";
              })()}
            </p>
          </div>
        </div>
      )}

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
            value={mergedCategory ?? "none"}
            onChange={(v) => queueUpdate({ category: v === "none" ? null : v })}
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
        {mergedTicketType === "incident" && (
          <FieldRow label="Affected System">
            <AffectedSystemInput
              value={mergedAffectedSys}
              onChange={(v) => queueUpdate({ affectedSystem: v })}
              disabled={updateMutation.isPending}
            />
          </FieldRow>
        )}
      </SidebarSection>

      {/* ── Triage ── */}
      <SidebarSection icon={BarChart2} title="Triage">
        <FieldRow label="Priority">
          <SearchableSelect
            value={mergedPriority ?? "none"}
            onChange={(v) => queueUpdate({ priority: v === "none" ? null : v })}
            options={priorityOptions}
            disabled={updateMutation.isPending}
          />
        </FieldRow>
        <FieldRow label="Severity">
          <SearchableSelect
            value={mergedSeverity ?? "none"}
            onChange={(v) => queueUpdate({ severity: v === "none" ? null : v })}
            options={severityOptions}
            disabled={updateMutation.isPending}
          />
        </FieldRow>
        <FieldRow label="Impact">
          <SearchableSelect
            value={mergedImpact ?? "none"}
            onChange={(v) => queueUpdate({ impact: v === "none" ? null : v })}
            options={impactOptions}
            disabled={updateMutation.isPending}
          />
        </FieldRow>
        <FieldRow label="Urgency">
          <SearchableSelect
            value={mergedUrgency ?? "none"}
            onChange={(v) => queueUpdate({ urgency: v === "none" ? null : v })}
            options={urgencyOptions}
            disabled={updateMutation.isPending}
          />
        </FieldRow>
      </SidebarSection>

      {/* ── Routing ── */}
      <SidebarSection icon={Users} title="Routing">
        <FieldRow label="Team">
          <SearchableSelect
            value={mergedTeamId != null ? String(mergedTeamId) : "none"}
            onChange={handleTeamChange}
            options={teamOptions}
            disabled={updateMutation.isPending}
          />
        </FieldRow>
        <FieldRow label={selectedTeam ? `Agent · ${selectedTeam.name}` : "Agent"}>
          <SearchableSelect
            value={mergedAssignedToId ?? "unassigned"}
            onChange={handleAgentChange}
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

      {/* ── Pick a team for the assignee ──────────────────────────────────
       *
       * Opens when the user assigns an agent who belongs to two or more
       * teams and the ticket isn't already on one of them. Lets the user
       * scope the assignment to a specific team in a single click.
       */}
      <Dialog
        open={teamPicker !== null}
        onOpenChange={(open) => { if (!open) setTeamPicker(null); }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-emerald-500" />
              Pick a team for {teamPicker?.agentName}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {teamPicker?.agentName} is on multiple teams. Choose which one
              this ticket should be routed under — the team drives SLA
              ownership and watcher notifications.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 py-1">
            {(teamPicker?.teams ?? []).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => confirmTeamPicker(t.id)}
                className="group flex items-center gap-3 rounded-lg border border-border/60 bg-card hover:border-primary/40 hover:bg-primary/[0.04] px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
              >
                <span
                  className="h-9 w-9 rounded-lg flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-sm"
                  style={{ backgroundColor: t.color }}
                >
                  {t.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                    {t.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {t.members.length} member{t.members.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground/50 group-hover:text-primary transition-colors">
                  Select →
                </span>
              </button>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTeamPicker(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
