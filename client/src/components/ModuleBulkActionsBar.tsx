/**
 * ModuleBulkActionsBar — reusable floating bulk-action bar for ITSM module
 * list pages (Incidents, Service Requests, Changes, Problems).
 *
 * Props determine which actions are available and which API endpoint to call.
 * All data (agents, teams) is fetched here so hooks never run inside portals.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { X, Trash2, UserPlus, Users, CircleDot, ChevronDown, Check } from "lucide-react";
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

interface Agent { id: string; name: string }
interface Team  { id: number; name: string; color: string }

export interface StatusOption { value: string; label: string }

// ─── Shared sub-components ────────────────────────────────────────────────────

function ActionBtn({
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
      <PopoverContent className="w-64 p-3" align="center" side="top" sideOffset={10}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

function PanelFooter({ onCancel, onApply, isPending, disabled, label }: {
  onCancel: () => void; onApply: () => void;
  isPending: boolean; disabled?: boolean; label: string;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2 border-t mt-2">
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>Cancel</Button>
      <Button size="sm" className="h-7 text-xs" onClick={onApply} disabled={isPending || disabled}>
        {isPending ? "Applying…" : label}
      </Button>
    </div>
  );
}

// ─── Assign Agent panel ───────────────────────────────────────────────────────

function AssignAgentPanel({ selectedIds, endpoint, queryKey, agents, onDone }: {
  selectedIds: number[]; endpoint: string; queryKey: string[];
  agents: Agent[]; onDone: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string | "__unassigned__">("__unassigned__");

  const mutation = useMutation({
    mutationFn: async () => {
      await axios.post(`${endpoint}/bulk`, {
        action: "assign", ids: selectedIds,
        assignedToId: picked === "__unassigned__" ? null : picked,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey }); onDone(); },
  });

  const filtered = agents.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Assign to Agent</p>
      <Input placeholder="Search agents…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs" />
      <div className="space-y-0.5 max-h-44 overflow-y-auto -mx-1 px-1">
        <button type="button" onClick={() => setPicked("__unassigned__")}
          className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors ${picked === "__unassigned__" ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}>
          <Check className={`h-3.5 w-3.5 shrink-0 ${picked === "__unassigned__" ? "opacity-100" : "opacity-0"}`} />
          <span className="text-muted-foreground">Unassigned</span>
        </button>
        {filtered.length === 0 && search && <p className="text-xs text-muted-foreground text-center py-2">No agents found</p>}
        {filtered.map((a) => (
          <button key={a.id} type="button" onClick={() => setPicked(a.id)}
            className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors ${picked === a.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}>
            <Check className={`h-3.5 w-3.5 shrink-0 ${picked === a.id ? "opacity-100" : "opacity-0"}`} />
            {a.name}
          </button>
        ))}
      </div>
      {mutation.isError && <ErrorAlert error={mutation.error} fallback="Failed to assign" />}
      <PanelFooter onCancel={onDone} onApply={() => mutation.mutate()} isPending={mutation.isPending}
        label={`Assign ${selectedIds.length} item${selectedIds.length !== 1 ? "s" : ""}`} />
    </div>
  );
}

// ─── Assign Team panel ────────────────────────────────────────────────────────

function AssignTeamPanel({ selectedIds, endpoint, queryKey, teams, teamLabel, onDone }: {
  selectedIds: number[]; endpoint: string; queryKey: string[];
  teams: Team[]; teamLabel: string; onDone: () => void;
}) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      await axios.post(`${endpoint}/bulk`, { action: "assign", ids: selectedIds, teamId: picked });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey }); onDone(); },
  });

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{teamLabel}</p>
      <div className="space-y-0.5 max-h-52 overflow-y-auto -mx-1 px-1">
        <button type="button" onClick={() => setPicked(null)}
          className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors ${picked === null ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}>
          <span className="h-2 w-2 rounded-full bg-muted-foreground/30 shrink-0" />
          None
        </button>
        {teams.map((t) => (
          <button key={t.id} type="button" onClick={() => setPicked(t.id)}
            className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors ${picked === t.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}>
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
            {t.name}
          </button>
        ))}
        {teams.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No teams configured</p>}
      </div>
      {mutation.isError && <ErrorAlert error={mutation.error} fallback="Failed to assign team" />}
      <PanelFooter onCancel={onDone} onApply={() => mutation.mutate()} isPending={mutation.isPending} label="Apply" />
    </div>
  );
}

// ─── Set Status panel ─────────────────────────────────────────────────────────

function SetStatusPanel({ selectedIds, endpoint, queryKey, statusOptions, onDone }: {
  selectedIds: number[]; endpoint: string; queryKey: string[];
  statusOptions: StatusOption[]; onDone: () => void;
}) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!picked) return;
      await axios.post(`${endpoint}/bulk`, { action: "status", ids: selectedIds, status: picked });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey }); onDone(); },
  });

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Set Status</p>
      <div className="space-y-0.5 max-h-52 overflow-y-auto -mx-1 px-1">
        {statusOptions.map((s) => (
          <button key={s.value} type="button" onClick={() => setPicked(s.value)}
            className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors ${picked === s.value ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}>
            <span className="h-2 w-2 rounded-full shrink-0 bg-muted-foreground/40" />
            {s.label}
          </button>
        ))}
      </div>
      {mutation.isError && <ErrorAlert error={mutation.error} fallback="Failed to update status" />}
      <PanelFooter onCancel={onDone} onApply={() => mutation.mutate()} isPending={mutation.isPending} disabled={!picked} label="Apply" />
    </div>
  );
}

// ─── ModuleBulkActionsBar ─────────────────────────────────────────────────────

type ActivePanel = "assign_agent" | "assign_team" | "status" | null;

export interface ModuleBulkActionsBarProps {
  selectedIds: number[];
  onClearSelection: () => void;
  /** API base path, e.g. "/api/incidents" */
  endpoint: string;
  /** React Query key to invalidate on success, e.g. ["incidents"] */
  queryKey: string[];
  /** Status options to show in the Set Status panel. Omit to hide the action. */
  statusOptions?: StatusOption[];
  /** Label for the team/group assignment panel, e.g. "Assign Team" or "Assign CAB Group" */
  teamLabel?: string;
  /** Entity display name, e.g. "incident", "request" */
  entityLabel?: string;
}

export default function ModuleBulkActionsBar({
  selectedIds, onClearSelection, endpoint, queryKey,
  statusOptions, teamLabel = "Assign Team", entityLabel = "item",
}: ModuleBulkActionsBarProps) {
  const qc = useQueryClient();
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => { const { data } = await axios.get<{ agents: Agent[] }>("/api/agents"); return data.agents; },
    enabled: selectedIds.length > 0,
  });

  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => { const { data } = await axios.get<{ teams: Team[] }>("/api/teams"); return data.teams; },
    enabled: selectedIds.length > 0,
  });

  const agents = agentsData ?? [];
  const teams  = teamsData  ?? [];

  const deleteMutation = useMutation({
    mutationFn: async () => { await axios.post(`${endpoint}/bulk`, { action: "delete", ids: selectedIds }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey }); setDeleteOpen(false); onClearSelection(); },
  });

  function closePanel() { setActivePanel(null); onClearSelection(); }

  const count   = selectedIds.length;
  const visible = count > 0;
  const plural  = count !== 1 ? `s` : "";

  return (
    <>
      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ease-out ${
        visible ? "translate-y-0 opacity-100 pointer-events-auto" : "translate-y-4 opacity-0 pointer-events-none"
      }`}>
        <div className="flex items-center gap-2 bg-gray-900 text-white rounded-xl shadow-2xl border border-white/10 px-4 py-2.5">

          {/* Count + clear */}
          <div className="flex items-center gap-2 pr-3 border-r border-white/15 shrink-0">
            <span className="inline-flex items-center justify-center h-5 min-w-5 rounded-full bg-primary text-[10px] font-bold text-white px-1.5 tabular-nums">
              {count}
            </span>
            <span className="text-xs text-white/80 whitespace-nowrap">
              {entityLabel}{plural} selected
            </span>
            <button type="button" onClick={onClearSelection}
              className="ml-0.5 rounded-full p-0.5 hover:bg-white/15 transition-colors" aria-label="Clear selection">
              <X className="h-3.5 w-3.5 text-white/60" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5">
            <ActionBtn icon={<UserPlus className="h-3.5 w-3.5" />} label="Assign Agent"
              open={activePanel === "assign_agent"} onOpenChange={(v) => setActivePanel(v ? "assign_agent" : null)}>
              <AssignAgentPanel selectedIds={selectedIds} endpoint={endpoint} queryKey={queryKey} agents={agents} onDone={closePanel} />
            </ActionBtn>

            <ActionBtn icon={<Users className="h-3.5 w-3.5" />} label={teamLabel}
              open={activePanel === "assign_team"} onOpenChange={(v) => setActivePanel(v ? "assign_team" : null)}>
              <AssignTeamPanel selectedIds={selectedIds} endpoint={endpoint} queryKey={queryKey} teams={teams} teamLabel={teamLabel} onDone={closePanel} />
            </ActionBtn>

            {statusOptions && statusOptions.length > 0 && (
              <ActionBtn icon={<CircleDot className="h-3.5 w-3.5" />} label="Set Status"
                open={activePanel === "status"} onOpenChange={(v) => setActivePanel(v ? "status" : null)}>
                <SetStatusPanel selectedIds={selectedIds} endpoint={endpoint} queryKey={queryKey} statusOptions={statusOptions} onDone={closePanel} />
              </ActionBtn>
            )}

            <div className="w-px h-5 bg-white/15 mx-0.5" />

            <Button variant="ghost" size="sm"
              className="h-8 gap-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/15"
              onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={(v) => { setDeleteOpen(v); if (!v) deleteMutation.reset(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {count} {entityLabel}{plural}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {count === 1 ? `this ${entityLabel}` : `all ${count} selected ${entityLabel}s`} and all associated data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.isError && <ErrorAlert message={`Failed to delete ${entityLabel}s`} />}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => deleteMutation.mutate()}>
              {deleteMutation.isPending ? "Deleting…" : `Delete ${count} ${entityLabel}${plural}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
