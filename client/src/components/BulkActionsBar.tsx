/**
 * BulkActionsBar — floating action bar that appears at the bottom of the screen
 * when one or more tickets are selected in the ticket list.
 *
 * All data fetching is hoisted to the top-level component so hooks are never
 * called inside conditionally-rendered portal content.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { agentTicketStatuses, statusLabel } from "core/constants/ticket-status.ts";
import { X, Trash2, UserPlus, Users, Zap, CircleDot, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import ErrorAlert from "@/components/ErrorAlert";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Agent       { id: string; name: string }
interface Team        { id: number; name: string; color: string }
interface CustomStatus { id: number; label: string; color: string; isActive: boolean }
interface Scenario    { id: number; name: string; color: string; isEnabled: boolean }

// ─── Shared action button ─────────────────────────────────────────────────────

function ActionButton({
  icon, label, children, open, onOpenChange,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className="h-8 gap-1.5 text-xs bg-white/10 hover:bg-white/20 text-white border-white/20 hover:text-white"
        >
          {icon}
          {label}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="center" side="top" sideOffset={10}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

// ─── Panel footer ─────────────────────────────────────────────────────────────

function PanelFooter({
  onCancel,
  onApply,
  isPending,
  disabled,
  applyLabel,
}: {
  onCancel: () => void;
  onApply: () => void;
  isPending: boolean;
  disabled?: boolean;
  applyLabel: string;
}) {
  return (
    <div className="flex justify-end gap-2 pt-1 border-t mt-2">
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
        Cancel
      </Button>
      <Button
        size="sm"
        className="h-7 text-xs"
        onClick={onApply}
        disabled={isPending || disabled}
      >
        {isPending ? "Applying…" : applyLabel}
      </Button>
    </div>
  );
}

// ─── Assign Agent panel ───────────────────────────────────────────────────────

function AssignAgentPanel({
  selectedIds, agents, onDone,
}: {
  selectedIds: number[];
  agents: Agent[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch]   = useState("");
  const [picked, setPicked]   = useState<string | null | "__unassigned__">("__unassigned__");

  const mutation = useMutation({
    mutationFn: async () => {
      await axios.post("/api/tickets/bulk", {
        action: "assign",
        ids: selectedIds,
        assignedToId: picked === "__unassigned__" ? null : picked,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      onDone();
    },
  });

  const filtered = agents.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
        Assign to Agent
      </p>
      <Input
        placeholder="Search agents…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 text-xs"
      />
      <div className="space-y-0.5 max-h-44 overflow-y-auto -mx-1 px-1">
        <button
          type="button"
          onClick={() => setPicked("__unassigned__")}
          className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors ${
            picked === "__unassigned__" ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
          }`}
        >
          <Check className={`h-3.5 w-3.5 shrink-0 ${picked === "__unassigned__" ? "opacity-100" : "opacity-0"}`} />
          <span className="text-muted-foreground">Unassigned</span>
        </button>
        {filtered.length === 0 && search && (
          <p className="text-xs text-muted-foreground text-center py-2">No agents found</p>
        )}
        {filtered.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setPicked(a.id)}
            className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors ${
              picked === a.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
            }`}
          >
            <Check className={`h-3.5 w-3.5 shrink-0 ${picked === a.id ? "opacity-100" : "opacity-0"}`} />
            {a.name}
          </button>
        ))}
      </div>
      {mutation.isError && <ErrorAlert error={mutation.error} fallback="Failed to assign agent" />}
      <PanelFooter
        onCancel={onDone}
        onApply={() => mutation.mutate()}
        isPending={mutation.isPending}
        applyLabel={`Assign ${selectedIds.length} ticket${selectedIds.length !== 1 ? "s" : ""}`}
      />
    </div>
  );
}

// ─── Assign Team panel ────────────────────────────────────────────────────────

function AssignTeamPanel({
  selectedIds, teams, onDone,
}: {
  selectedIds: number[];
  teams: Team[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      await axios.post("/api/tickets/bulk", {
        action: "assign",
        ids: selectedIds,
        teamId: picked,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      onDone();
    },
  });

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
        Assign to Team
      </p>
      <div className="space-y-0.5 max-h-52 overflow-y-auto -mx-1 px-1">
        <button
          type="button"
          onClick={() => setPicked(null)}
          className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors ${
            picked === null ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-muted-foreground/30 shrink-0" />
          No team
        </button>
        {teams.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setPicked(t.id)}
            className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors ${
              picked === t.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
            }`}
          >
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
            {t.name}
          </button>
        ))}
        {teams.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">No teams configured</p>
        )}
      </div>
      {mutation.isError && <ErrorAlert error={mutation.error} fallback="Failed to assign team" />}
      <PanelFooter
        onCancel={onDone}
        onApply={() => mutation.mutate()}
        isPending={mutation.isPending}
        applyLabel="Apply"
      />
    </div>
  );
}

// ─── Set Status panel ─────────────────────────────────────────────────────────

function SetStatusPanel({
  selectedIds, customStatuses, onDone,
}: {
  selectedIds: number[];
  customStatuses: CustomStatus[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<string | null>(null);

  const builtInOptions = agentTicketStatuses.map((s) => ({
    value: s,
    label: statusLabel[s],
    color: undefined as string | undefined,
  }));

  const customOptions = customStatuses
    .filter((c) => c.isActive)
    .map((c) => ({ value: `custom_${c.id}`, label: c.label, color: c.color }));

  const allOptions = [...builtInOptions, ...customOptions];

  const mutation = useMutation({
    mutationFn: async () => {
      if (!picked) return;
      const payload = picked.startsWith("custom_")
        ? { action: "status", ids: selectedIds, customStatusId: parseInt(picked.replace("custom_", ""), 10) }
        : { action: "status", ids: selectedIds, status: picked };
      await axios.post("/api/tickets/bulk", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      onDone();
    },
  });

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
        Set Status
      </p>
      <div className="space-y-0.5 max-h-52 overflow-y-auto -mx-1 px-1">
        {allOptions.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setPicked(s.value)}
            className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors ${
              picked === s.value ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
            }`}
          >
            <span
              className="h-2 w-2 rounded-full shrink-0 bg-muted-foreground/40"
              style={s.color ? { backgroundColor: s.color } : undefined}
            />
            {s.label}
          </button>
        ))}
      </div>
      {mutation.isError && <ErrorAlert error={mutation.error} fallback="Failed to update status" />}
      <PanelFooter
        onCancel={onDone}
        onApply={() => mutation.mutate()}
        isPending={mutation.isPending}
        disabled={!picked}
        applyLabel="Apply"
      />
    </div>
  );
}

// ─── Run Scenario panel ───────────────────────────────────────────────────────

function RunScenarioPanel({
  selectedIds, scenarios, onDone,
}: {
  selectedIds: number[];
  scenarios: Scenario[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<number | null>(null);

  const enabled = scenarios.filter((s) => s.isEnabled);

  const mutation = useMutation({
    mutationFn: async () => {
      await axios.post("/api/tickets/bulk", {
        action: "scenario",
        ids: selectedIds,
        scenarioId: picked,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      onDone();
    },
  });

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
        Run Scenario
      </p>
      {enabled.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          No scenarios available. Create one in Automations.
        </p>
      ) : (
        <div className="space-y-0.5 max-h-52 overflow-y-auto -mx-1 px-1">
          {enabled.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setPicked(s.id)}
              className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors ${
                picked === s.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
              }`}
            >
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: s.color }}
              />
              {s.name}
            </button>
          ))}
        </div>
      )}
      {mutation.isError && <ErrorAlert error={mutation.error} fallback="Failed to run scenario" />}
      <PanelFooter
        onCancel={onDone}
        onApply={() => mutation.mutate()}
        isPending={mutation.isPending}
        disabled={!picked}
        applyLabel={`Run on ${selectedIds.length} ticket${selectedIds.length !== 1 ? "s" : ""}`}
      />
    </div>
  );
}

// ─── BulkActionsBar ───────────────────────────────────────────────────────────

type ActivePanel = "assign_agent" | "assign_team" | "status" | "scenario" | null;

interface BulkActionsBarProps {
  selectedIds: number[];
  onClearSelection: () => void;
}

export default function BulkActionsBar({ selectedIds, onClearSelection }: BulkActionsBarProps) {
  const queryClient = useQueryClient();
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [deleteOpen, setDeleteOpen]   = useState(false);

  // ── All data fetched here, at the top level ──────────────────────────────────
  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: Agent[] }>("/api/agents");
      return data.agents;
    },
    enabled: selectedIds.length > 0,
  });

  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data } = await axios.get<{ teams: Team[] }>("/api/teams");
      return data.teams;
    },
    enabled: selectedIds.length > 0,
  });

  // Use a distinct query key to avoid the cache conflict with TicketsFilters.
  const { data: customStatusesData } = useQuery({
    queryKey: ["ticket-status-configs-bulk"],
    queryFn: async () => {
      const { data } = await axios.get<{ configs: CustomStatus[] }>("/api/ticket-status-configs");
      return data.configs;
    },
    enabled: selectedIds.length > 0,
  });

  const { data: scenariosData } = useQuery({
    queryKey: ["scenarios"],
    queryFn: async () => {
      const { data } = await axios.get<{ scenarios: Scenario[] }>("/api/scenarios");
      return data.scenarios;
    },
    enabled: selectedIds.length > 0,
  });

  const agents         = agentsData       ?? [];
  const teams          = teamsData        ?? [];
  const customStatuses = customStatusesData ?? [];
  const scenarios      = scenariosData    ?? [];

  // ── Delete ───────────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async () => {
      await axios.post("/api/tickets/bulk", { action: "delete", ids: selectedIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      setDeleteOpen(false);
      onClearSelection();
    },
  });

  function closePanel() {
    setActivePanel(null);
    onClearSelection();
  }

  const count   = selectedIds.length;
  const visible = count > 0;

  return (
    <>
      {/* Floating bar */}
      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ease-out ${
          visible
            ? "translate-y-0 opacity-100 pointer-events-auto"
            : "translate-y-4 opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-2 bg-gray-900 text-white rounded-xl shadow-2xl border border-white/10 px-4 py-2.5">

          {/* Count + clear */}
          <div className="flex items-center gap-2 pr-3 border-r border-white/15 shrink-0">
            <span className="inline-flex items-center justify-center h-5 min-w-5 rounded-full bg-primary text-[10px] font-bold text-white px-1.5 tabular-nums">
              {count}
            </span>
            <span className="text-xs text-white/80 whitespace-nowrap">
              ticket{count !== 1 ? "s" : ""} selected
            </span>
            <button
              type="button"
              onClick={onClearSelection}
              className="ml-0.5 rounded-full p-0.5 hover:bg-white/15 transition-colors"
              aria-label="Clear selection"
            >
              <X className="h-3.5 w-3.5 text-white/60" />
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5">

            <ActionButton
              icon={<UserPlus className="h-3.5 w-3.5" />}
              label="Assign Agent"
              open={activePanel === "assign_agent"}
              onOpenChange={(v) => setActivePanel(v ? "assign_agent" : null)}
            >
              <AssignAgentPanel
                selectedIds={selectedIds}
                agents={agents}
                onDone={closePanel}
              />
            </ActionButton>

            <ActionButton
              icon={<Users className="h-3.5 w-3.5" />}
              label="Assign Team"
              open={activePanel === "assign_team"}
              onOpenChange={(v) => setActivePanel(v ? "assign_team" : null)}
            >
              <AssignTeamPanel
                selectedIds={selectedIds}
                teams={teams}
                onDone={closePanel}
              />
            </ActionButton>

            <ActionButton
              icon={<CircleDot className="h-3.5 w-3.5" />}
              label="Set Status"
              open={activePanel === "status"}
              onOpenChange={(v) => setActivePanel(v ? "status" : null)}
            >
              <SetStatusPanel
                selectedIds={selectedIds}
                customStatuses={customStatuses}
                onDone={closePanel}
              />
            </ActionButton>

            <ActionButton
              icon={<Zap className="h-3.5 w-3.5" />}
              label="Run Scenario"
              open={activePanel === "scenario"}
              onOpenChange={(v) => setActivePanel(v ? "scenario" : null)}
            >
              <RunScenarioPanel
                selectedIds={selectedIds}
                scenarios={scenarios}
                onDone={closePanel}
              />
            </ActionButton>

            <div className="w-px h-5 bg-white/15 mx-0.5" />

            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/15"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteOpen}
        onOpenChange={(v) => { setDeleteOpen(v); if (!v) deleteMutation.reset(); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {count} ticket{count !== 1 ? "s" : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {count === 1 ? "this ticket" : `all ${count} selected tickets`} along
              with all their replies, notes, and attachments. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.isError && <ErrorAlert message="Failed to delete tickets" />}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending
                ? "Deleting…"
                : `Delete ${count} ticket${count !== 1 ? "s" : ""}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
