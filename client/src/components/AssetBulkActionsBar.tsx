import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  ASSET_STATUSES, ASSET_STATUS_LABEL, LIFECYCLE_TRANSITIONS,
  type AssetStatus,
} from "core/constants/assets.ts";
import {
  X, Trash2, UserPlus, Users, MapPin, User, RotateCcw, ChevronDown, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import ErrorAlert from "@/components/ErrorAlert";

// ── Shared sub-components ─────────────────────────────────────────────────────

interface Agent { id: string; name: string }
interface Team  { id: number; name: string; color: string }

function ActionButton({
  icon, label, children, open, onOpenChange,
}: {
  icon: React.ReactNode; label: string; children: React.ReactNode;
  open: boolean; onOpenChange: (v: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary" size="sm"
          className="h-8 gap-1.5 text-xs bg-white/10 hover:bg-white/20 text-white border-white/20 hover:text-white"
        >
          {icon} {label}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="center" side="top" sideOffset={10}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

function PanelFooter({
  onCancel, onApply, isPending, disabled, applyLabel,
}: {
  onCancel: () => void; onApply: () => void;
  isPending: boolean; disabled?: boolean; applyLabel: string;
}) {
  return (
    <div className="flex justify-end gap-2 pt-1 border-t mt-2">
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>Cancel</Button>
      <Button size="sm" className="h-7 text-xs" onClick={onApply} disabled={isPending || disabled}>
        {isPending ? "Applying…" : applyLabel}
      </Button>
    </div>
  );
}

// ── Transition panel ──────────────────────────────────────────────────────────

function TransitionPanel({ selectedIds, onDone }: { selectedIds: number[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<AssetStatus | null>(null);

  // All target statuses that appear in any valid transition
  const allTargets = Array.from(
    new Set(Object.values(LIFECYCLE_TRANSITIONS).flat())
  ) as AssetStatus[];

  const mutation = useMutation({
    mutationFn: async () => {
      await axios.post("/api/assets/bulk", { action: "transition", ids: selectedIds, status: picked });
    },
    onSuccess: (_, __, ctx) => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["assets-stats"] });
      onDone();
    },
  });

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
        Lifecycle Transition
      </p>
      <p className="text-xs text-muted-foreground">
        Only valid transitions per asset will apply. Others are skipped.
      </p>
      <div className="space-y-0.5 max-h-48 overflow-y-auto -mx-1 px-1">
        {ASSET_STATUSES.filter(s => allTargets.includes(s)).map(s => (
          <button
            key={s} type="button" onClick={() => setPicked(s)}
            className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors ${
              picked === s ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
            }`}
          >
            <Check className={`h-3.5 w-3.5 shrink-0 ${picked === s ? "opacity-100" : "opacity-0"}`} />
            {ASSET_STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      {mutation.isError && <ErrorAlert error={mutation.error} fallback="Transition failed" />}
      <PanelFooter
        onCancel={onDone}
        onApply={() => mutation.mutate()}
        isPending={mutation.isPending}
        disabled={!picked}
        applyLabel={`Transition ${selectedIds.length} asset${selectedIds.length !== 1 ? "s" : ""}`}
      />
    </div>
  );
}

// ── Assign panel ──────────────────────────────────────────────────────────────

function AssignPanel({
  selectedIds, agents, onDone,
}: { selectedIds: number[]; agents: Agent[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string | null | "__unassigned__">("__unassigned__");

  const filtered = agents.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));

  const mutation = useMutation({
    mutationFn: async () => {
      await axios.post("/api/assets/bulk", {
        action: "assign",
        ids:    selectedIds,
        userId: picked === "__unassigned__" ? null : picked,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      onDone();
    },
  });

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Assign To</p>
      <Input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs" />
      <div className="space-y-0.5 max-h-44 overflow-y-auto -mx-1 px-1">
        <button type="button" onClick={() => setPicked("__unassigned__")}
          className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors ${
            picked === "__unassigned__" ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
          }`}>
          <Check className={`h-3.5 w-3.5 shrink-0 ${picked === "__unassigned__" ? "opacity-100" : "opacity-0"}`} />
          <span className="text-muted-foreground">Unassigned</span>
        </button>
        {filtered.map(a => (
          <button key={a.id} type="button" onClick={() => setPicked(a.id)}
            className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors ${
              picked === a.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
            }`}>
            <Check className={`h-3.5 w-3.5 shrink-0 ${picked === a.id ? "opacity-100" : "opacity-0"}`} />
            {a.name}
          </button>
        ))}
      </div>
      {mutation.isError && <ErrorAlert error={mutation.error} fallback="Failed to assign" />}
      <PanelFooter onCancel={onDone} onApply={() => mutation.mutate()} isPending={mutation.isPending}
        applyLabel={`Assign ${selectedIds.length} asset${selectedIds.length !== 1 ? "s" : ""}`} />
    </div>
  );
}

// ── Set Owner panel ───────────────────────────────────────────────────────────

function SetOwnerPanel({
  selectedIds, agents, onDone,
}: { selectedIds: number[]; agents: Agent[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  const filtered = agents.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));

  const mutation = useMutation({
    mutationFn: async () => {
      await axios.post("/api/assets/bulk", { action: "owner", ids: selectedIds, ownerId: picked });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      onDone();
    },
  });

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Set Owner</p>
      <Input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs" />
      <div className="space-y-0.5 max-h-44 overflow-y-auto -mx-1 px-1">
        <button type="button" onClick={() => setPicked(null)}
          className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors ${
            picked === null ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
          }`}>
          <Check className={`h-3.5 w-3.5 shrink-0 ${picked === null ? "opacity-100" : "opacity-0"}`} />
          <span className="text-muted-foreground">No owner</span>
        </button>
        {filtered.map(a => (
          <button key={a.id} type="button" onClick={() => setPicked(a.id)}
            className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors ${
              picked === a.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
            }`}>
            <Check className={`h-3.5 w-3.5 shrink-0 ${picked === a.id ? "opacity-100" : "opacity-0"}`} />
            {a.name}
          </button>
        ))}
      </div>
      {mutation.isError && <ErrorAlert error={mutation.error} fallback="Failed to set owner" />}
      <PanelFooter onCancel={onDone} onApply={() => mutation.mutate()} isPending={mutation.isPending}
        applyLabel="Apply" />
    </div>
  );
}

// ── Set Team panel ────────────────────────────────────────────────────────────

function SetTeamPanel({
  selectedIds, teams, onDone,
}: { selectedIds: number[]; teams: Team[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      await axios.post("/api/assets/bulk", { action: "team", ids: selectedIds, teamId: picked });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      onDone();
    },
  });

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Set Team</p>
      <div className="space-y-0.5 max-h-48 overflow-y-auto -mx-1 px-1">
        <button type="button" onClick={() => setPicked(null)}
          className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors ${
            picked === null ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
          }`}>
          <span className="h-2 w-2 rounded-full bg-muted-foreground/30 shrink-0" />
          No team
        </button>
        {teams.map(t => (
          <button key={t.id} type="button" onClick={() => setPicked(t.id)}
            className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors ${
              picked === t.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
            }`}>
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
            {t.name}
          </button>
        ))}
        {teams.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No teams configured</p>}
      </div>
      {mutation.isError && <ErrorAlert error={mutation.error} fallback="Failed to set team" />}
      <PanelFooter onCancel={onDone} onApply={() => mutation.mutate()} isPending={mutation.isPending}
        applyLabel="Apply" />
    </div>
  );
}

// ── Set Location panel ────────────────────────────────────────────────────────

function SetLocationPanel({ selectedIds, onDone }: { selectedIds: number[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [location, setLocation] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      await axios.post("/api/assets/bulk", {
        action: "location", ids: selectedIds,
        location: location.trim() || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      onDone();
    },
  });

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Set Location</p>
      <Input
        placeholder="Leave blank to clear"
        value={location}
        onChange={e => setLocation(e.target.value)}
        className="h-8 text-xs"
      />
      {mutation.isError && <ErrorAlert error={mutation.error} fallback="Failed to set location" />}
      <PanelFooter onCancel={onDone} onApply={() => mutation.mutate()} isPending={mutation.isPending}
        applyLabel="Apply" />
    </div>
  );
}

// ── AssetBulkActionsBar ───────────────────────────────────────────────────────

type ActivePanel = "transition" | "assign" | "owner" | "team" | "location" | null;

interface AssetBulkActionsBarProps {
  selectedIds:      number[];
  onClearSelection: () => void;
}

export default function AssetBulkActionsBar({ selectedIds, onClearSelection }: AssetBulkActionsBarProps) {
  const qc = useQueryClient();
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [deleteOpen, setDeleteOpen]   = useState(false);

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => (await axios.get<{ agents: Agent[] }>("/api/agents")).data.agents,
    enabled: selectedIds.length > 0,
  });

  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => (await axios.get<{ teams: Team[] }>("/api/teams")).data.teams,
    enabled: selectedIds.length > 0,
  });

  const agents = agentsData ?? [];
  const teams  = teamsData  ?? [];

  const deleteMutation = useMutation({
    mutationFn: async () => {
      // Server now does a partial delete: returns { affected, skipped }
      // where `skipped` counts active (deployed / in_use) assets that
      // weren't deletable. We need the response so we can show the user
      // a clear "X moved, Y skipped" summary after success.
      const { data } = await axios.post<{ affected: number; skipped: number }>(
        "/api/assets/bulk",
        { action: "delete", ids: selectedIds },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["assets-stats"] });
      qc.invalidateQueries({ queryKey: ["trash-summary"] });
      setDeleteOpen(false);
      onClearSelection();
    },
  });

  function closePanel() { setActivePanel(null); onClearSelection(); }

  const count   = selectedIds.length;
  const visible = count > 0;

  return (
    <>
      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ease-out ${
          visible ? "translate-y-0 opacity-100 pointer-events-auto" : "translate-y-4 opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-2 bg-gray-900 text-white rounded-xl shadow-2xl border border-white/10 px-4 py-2.5">

          {/* Count + clear */}
          <div className="flex items-center gap-2 pr-3 border-r border-white/15 shrink-0">
            <span className="inline-flex items-center justify-center h-5 min-w-5 rounded-full bg-primary text-[10px] font-bold text-white px-1.5 tabular-nums">
              {count}
            </span>
            <span className="text-xs text-white/80 whitespace-nowrap">
              asset{count !== 1 ? "s" : ""} selected
            </span>
            <button type="button" onClick={onClearSelection}
              className="ml-0.5 rounded-full p-0.5 hover:bg-white/15 transition-colors" aria-label="Clear">
              <X className="h-3.5 w-3.5 text-white/60" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5">

            <ActionButton icon={<RotateCcw className="h-3.5 w-3.5" />} label="Transition"
              open={activePanel === "transition"} onOpenChange={v => setActivePanel(v ? "transition" : null)}>
              <TransitionPanel selectedIds={selectedIds} onDone={closePanel} />
            </ActionButton>

            <ActionButton icon={<UserPlus className="h-3.5 w-3.5" />} label="Assign"
              open={activePanel === "assign"} onOpenChange={v => setActivePanel(v ? "assign" : null)}>
              <AssignPanel selectedIds={selectedIds} agents={agents} onDone={closePanel} />
            </ActionButton>

            <ActionButton icon={<User className="h-3.5 w-3.5" />} label="Set Owner"
              open={activePanel === "owner"} onOpenChange={v => setActivePanel(v ? "owner" : null)}>
              <SetOwnerPanel selectedIds={selectedIds} agents={agents} onDone={closePanel} />
            </ActionButton>

            <ActionButton icon={<Users className="h-3.5 w-3.5" />} label="Set Team"
              open={activePanel === "team"} onOpenChange={v => setActivePanel(v ? "team" : null)}>
              <SetTeamPanel selectedIds={selectedIds} teams={teams} onDone={closePanel} />
            </ActionButton>

            <ActionButton icon={<MapPin className="h-3.5 w-3.5" />} label="Set Location"
              open={activePanel === "location"} onOpenChange={v => setActivePanel(v ? "location" : null)}>
              <SetLocationPanel selectedIds={selectedIds} onDone={closePanel} />
            </ActionButton>

            <div className="w-px h-5 bg-white/15 mx-0.5" />

            <Button variant="ghost" size="sm"
              className="h-8 gap-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/15"
              onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              Move to trash
            </Button>
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={v => { setDeleteOpen(v); if (!v) deleteMutation.reset(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move {count} asset{count !== 1 ? "s" : ""} to trash?</AlertDialogTitle>
            <AlertDialogDescription>
              Active assets (deployed or in use) cannot be deleted — retire or return them first.
              All others will be moved to the trash and can be restored from Settings → Trash within the configured retention window before they're permanently purged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.isError && <ErrorAlert error={deleteMutation.error} fallback="Failed to delete assets" />}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? "Moving…" : `Move ${count} asset${count !== 1 ? "s" : ""} to trash`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
