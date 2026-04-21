/**
 * VisibilityDialog — lets a report owner control who can see their report.
 *
 * Three visibility levels:
 *   private  — only the creator
 *   team     — all members of a chosen team
 *   org      — everyone in the organisation (org-wide)
 *
 * Additionally, specific agents can be granted read or edit access via
 * the ReportShare feature (POST /api/analytics/reports/:id/share).
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  Globe, Users, Lock, Check, Loader2, UserPlus, X, ChevronDown,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import ErrorAlert from "@/components/ErrorAlert";
import { cn } from "@/lib/utils";
import { updateReport } from "@/lib/reports/analytics-api";
import type { SavedReportMeta } from "@/lib/reports/analytics-api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Team {
  id: number;
  name: string;
  color?: string | null;
}

interface AgentUser {
  id: string;
  name: string;
  email: string;
}

type VisibilityLevel = "private" | "team" | "org";

// ── Level card ────────────────────────────────────────────────────────────────

const LEVELS: {
  value: VisibilityLevel;
  icon: React.ElementType;
  label: string;
  desc: string;
  accent: string;
}[] = [
  {
    value: "private",
    icon:  Lock,
    label: "Private",
    desc:  "Only you can see this report.",
    accent: "border-slate-400 bg-slate-50 dark:bg-slate-900/30",
  },
  {
    value: "team",
    icon:  Users,
    label: "Team",
    desc:  "Everyone in a chosen team can view this report.",
    accent: "border-blue-400 bg-blue-50 dark:bg-blue-900/20",
  },
  {
    value: "org",
    icon:  Globe,
    label: "Org-wide",
    desc:  "All agents and supervisors in your organisation.",
    accent: "border-violet-400 bg-violet-50 dark:bg-violet-900/20",
  },
];

// ── Agent chip ────────────────────────────────────────────────────────────────

function AgentChip({ agent, onRemove }: { agent: AgentUser; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs bg-muted border border-border rounded-full px-2.5 py-1">
      <span className="h-4 w-4 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[9px] font-bold">
        {agent.name.charAt(0).toUpperCase()}
      </span>
      {agent.name}
      <button
        type="button"
        onClick={onRemove}
        className="text-muted-foreground hover:text-foreground transition-colors ml-0.5"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface VisibilityDialogProps {
  report: SavedReportMeta;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function VisibilityDialog({ report, open, onOpenChange }: VisibilityDialogProps) {
  const qc = useQueryClient();

  // Local state (initialised from the report)
  const [level,          setLevel]          = useState<VisibilityLevel>(
    (report.visibility as VisibilityLevel) ?? "private",
  );
  const [teamId,         setTeamId]         = useState<number | null>(report.teamId ?? null);
  const [sharedAgents,   setSharedAgents]   = useState<AgentUser[]>([]);
  const [agentSearch,    setAgentSearch]    = useState("");
  const [sharePermission,setSharePermission]= useState<"view" | "edit">("view");

  // Reset when report changes or dialog opens
  useEffect(() => {
    if (open) {
      setLevel((report.visibility as VisibilityLevel) ?? "private");
      setTeamId(report.teamId ?? null);
      setSharedAgents([]);
      setAgentSearch("");
    }
  }, [open, report]);

  // ── Remote data ──────────────────────────────────────────────────────────

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["teams-list"],
    queryFn: async () => {
      const { data } = await axios.get<{ teams: Team[] }>("/api/teams");
      return data.teams;
    },
    staleTime: 60_000,
    enabled: open,
  });

  const { data: allAgents = [] } = useQuery<AgentUser[]>({
    queryKey: ["agents-list"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: AgentUser[] }>("/api/agents");
      return data.agents ?? [];
    },
    staleTime: 60_000,
    enabled: open,
  });

  // Filter agents for the search dropdown
  const sharedIds = new Set(sharedAgents.map(a => a.id));
  const filteredAgents = allAgents.filter(a =>
    !sharedIds.has(a.id) &&
    (a.name.toLowerCase().includes(agentSearch.toLowerCase()) ||
     a.email.toLowerCase().includes(agentSearch.toLowerCase())),
  ).slice(0, 8);

  // ── Save mutation ─────────────────────────────────────────────────────────

  const saveMut = useMutation({
    mutationFn: async () => {
      // 1. Update the report's base visibility
      await updateReport(report.id, {
        visibility:       level,
        visibilityTeamId: level === "team" ? (teamId ?? undefined) : null,
      });

      // 2. Create per-agent shares if any were added
      for (const agent of sharedAgents) {
        await axios.post(`/api/analytics/reports/${report.id}/share`, {
          sharedToId: agent.id,
          canEdit:    sharePermission === "edit",
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["analytics", "reports"] });
      onOpenChange(false);
    },
  });

  const isDirty =
    level !== (report.visibility as VisibilityLevel) ||
    (level === "team" && teamId !== (report.teamId ?? null)) ||
    sharedAgents.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Manage Visibility</DialogTitle>
          <DialogDescription className="text-xs">
            Control who can see <strong className="text-foreground">{report.name}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* ── Visibility level selector ─────────────────────────────── */}
          <div className="grid grid-cols-3 gap-2">
            {LEVELS.map(l => {
              const Icon = l.icon;
              const active = level === l.value;
              return (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => setLevel(l.value)}
                  className={cn(
                    "relative flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border-2 text-center transition-all",
                    "hover:border-primary/40",
                    active ? `${l.accent} border-2` : "border-border bg-background",
                  )}
                >
                  {active && (
                    <span className="absolute top-1.5 right-1.5 h-3.5 w-3.5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-2 w-2 text-primary-foreground" />
                    </span>
                  )}
                  <Icon className={cn("h-5 w-5", active ? "text-primary" : "text-muted-foreground")} />
                  <span className={cn("text-[11px] font-semibold leading-none", active ? "text-foreground" : "text-muted-foreground")}>
                    {l.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Description of chosen level */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            {LEVELS.find(l => l.value === level)?.desc}
          </p>

          {/* ── Team selector (when level = "team") ──────────────────── */}
          {level === "team" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Team</label>
              <Select
                value={teamId ? String(teamId) : ""}
                onValueChange={v => setTeamId(Number(v))}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Choose a team…" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      <span className="flex items-center gap-2">
                        {t.color && (
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: t.color }} />
                        )}
                        {t.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ── Per-agent sharing (available at any level) ────────────── */}
          <div className="space-y-2 border-t border-border/60 pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">Also share with specific agents</p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                    {sharePermission === "edit" ? "Can edit" : "Can view"}
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="text-xs" onClick={() => setSharePermission("view")}>
                    {sharePermission === "view" && <Check className="h-3 w-3 mr-1.5" />}
                    Can view
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs" onClick={() => setSharePermission("edit")}>
                    {sharePermission === "edit" && <Check className="h-3 w-3 mr-1.5" />}
                    Can edit
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Agent search */}
            <div className="relative">
              <UserPlus className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-8 h-8 text-xs"
                placeholder="Search agents by name or email…"
                value={agentSearch}
                onChange={e => setAgentSearch(e.target.value)}
              />
            </div>

            {/* Search results dropdown */}
            {agentSearch && filteredAgents.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden bg-popover shadow-sm">
                {filteredAgents.map(agent => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => {
                      setSharedAgents(prev => [...prev, agent]);
                      setAgentSearch("");
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-muted/50 transition-colors text-left"
                  >
                    <span className="h-6 w-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                      {agent.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="font-medium block truncate">{agent.name}</span>
                      <span className="text-muted-foreground truncate">{agent.email}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {agentSearch && filteredAgents.length === 0 && (
              <p className="text-xs text-muted-foreground py-1">No agents found.</p>
            )}

            {/* Selected agents */}
            {sharedAgents.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {sharedAgents.map(agent => (
                  <AgentChip
                    key={agent.id}
                    agent={agent}
                    onRemove={() => setSharedAgents(prev => prev.filter(a => a.id !== agent.id))}
                  />
                ))}
              </div>
            )}

            {sharedAgents.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {sharedAgents.length} agent{sharedAgents.length > 1 ? "s" : ""} will receive{" "}
                <strong>{sharePermission === "edit" ? "edit" : "view"}</strong> access.
              </p>
            )}
          </div>
        </div>

        {saveMut.isError && (
          <ErrorAlert error={saveMut.error as Error} fallback="Failed to update visibility" />
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border/60">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saveMut.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => saveMut.mutate()}
            disabled={!isDirty || saveMut.isPending || (level === "team" && !teamId)}
            className="gap-1.5"
          >
            {saveMut.isPending
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
              : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
