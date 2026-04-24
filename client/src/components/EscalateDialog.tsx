/**
 * EscalateDialog
 *
 * Lets an agent choose where a ticket is being escalated before confirming.
 * Both team and agent are optional but at least one is recommended.
 * On confirm:
 *   • ticket status → "escalated"
 *   • isEscalated   → true
 *   • assignedTo    → selected agent (if any)
 *   • team          → selected team  (if any)
 *   • escalation event logged for audit trail
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button }  from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label }   from "@/components/ui/label";
import {
  AlertTriangle, Loader2, Users, User, ArrowRight, Info,
} from "lucide-react";
import SearchableSelect, { type SelectOption } from "@/components/SearchableSelect";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Team   { id: number; name: string; color: string; members: { userId: string }[] }
interface Agent  { id: string; name: string; email: string; role: string }

interface Props {
  open:         boolean;
  ticketSubject: string;
  onClose:      () => void;
  onConfirm:    (params: { escalateToTeamId?: number; escalateToUserId?: string }) => void;
  isPending:    boolean;
}

const NONE = "__none__";

// ── Main component ────────────────────────────────────────────────────────────

export default function EscalateDialog({
  open, ticketSubject, onClose, onConfirm, isPending,
}: Props) {
  const [selectedTeamId, setSelectedTeamId] = useState<string>(NONE);
  const [selectedUserId, setSelectedUserId] = useState<string>(NONE);

  // Reset on open
  useEffect(() => {
    if (open) { setSelectedTeamId(NONE); setSelectedUserId(NONE); }
  }, [open]);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: teamsRaw = [] } = useQuery({
    queryKey: ["teams"],
    queryFn:  () => axios.get<{ teams: Team[] }>("/api/teams").then((r) => r.data.teams),
    staleTime: 60_000,
    enabled: open,
  });

  const { data: agentsRaw = [] } = useQuery({
    queryKey: ["agents"],
    queryFn:  () => axios.get<{ agents: Agent[] }>("/api/agents").then((r) => r.data.agents),
    staleTime: 60_000,
    enabled: open,
  });

  // When a team is selected, filter agents to members of that team
  const selectedTeam = teamsRaw.find((t) => String(t.id) === selectedTeamId);
  const memberIds = selectedTeam
    ? new Set(selectedTeam.members.map((m) => m.userId))
    : null;

  const visibleAgents = memberIds
    ? agentsRaw.filter((a) => memberIds.has(a.id))
    : agentsRaw;

  // Clear agent selection if it's no longer in the filtered list
  useEffect(() => {
    if (selectedUserId !== NONE && memberIds && !memberIds.has(selectedUserId)) {
      setSelectedUserId(NONE);
    }
  }, [selectedTeamId]);

  // ── Options ────────────────────────────────────────────────────────────────
  const teamOptions: SelectOption[] = [
    { value: NONE, label: "No specific team" },
    ...teamsRaw.map((t) => ({
      value: String(t.id),
      label: t.name,
      prefix: (
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: t.color }}
        />
      ),
    })),
  ];

  const agentOptions: SelectOption[] = [
    { value: NONE, label: "No specific agent" },
    ...visibleAgents.map((a) => ({
      value: a.id,
      label: a.name,
      prefix: (
        <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
          {a.name.charAt(0).toUpperCase()}
        </span>
      ),
    })),
  ];

  function handleConfirm() {
    onConfirm({
      escalateToTeamId: selectedTeamId !== NONE ? Number(selectedTeamId) : undefined,
      escalateToUserId: selectedUserId !== NONE ? selectedUserId           : undefined,
    });
  }

  const selectedTeamName  = teamsRaw.find((t)  => String(t.id) === selectedTeamId)?.name;
  const selectedAgentName = agentsRaw.find((a) => a.id           === selectedUserId)?.name;
  const hasTarget         = selectedTeamId !== NONE || selectedUserId !== NONE;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </span>
            Escalate Ticket
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
            Escalating <span className="font-medium text-foreground">"{ticketSubject}"</span> will
            change its status to <span className="font-semibold text-destructive">Escalated</span> and
            notify the selected team or agent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Escalate to team */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-semibold">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              Escalate to team
            </Label>
            <SearchableSelect
              options={teamOptions}
              value={selectedTeamId}
              onChange={setSelectedTeamId}
              placeholder="Search teams…"
            />
            {selectedTeamId !== NONE && (
              <p className="text-[11px] text-muted-foreground">
                All members of <strong>{selectedTeamName}</strong> will be notified.
              </p>
            )}
          </div>

          {/* Escalate to agent */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-semibold">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              Assign to agent
              <span className="text-[10px] font-normal text-muted-foreground ml-auto">
                {selectedTeamId !== NONE ? "filtered by team" : "all agents"}
              </span>
            </Label>
            <SearchableSelect
              options={agentOptions}
              value={selectedUserId}
              onChange={setSelectedUserId}
              placeholder="Search agents…"
            />
          </div>

          {/* Escalation summary */}
          {hasTarget && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 space-y-1.5">
              <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                <ArrowRight className="h-3.5 w-3.5" />
                Escalation summary
              </p>
              {selectedTeamName && (
                <p className="text-xs text-muted-foreground">
                  Team: <span className="font-medium text-foreground">{selectedTeamName}</span>
                </p>
              )}
              {selectedAgentName && (
                <p className="text-xs text-muted-foreground">
                  Assigned to: <span className="font-medium text-foreground">{selectedAgentName}</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Status will change to{" "}
                <span className="font-semibold text-destructive">Escalated</span>
              </p>
            </div>
          )}

          {!hasTarget && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 flex gap-2.5 items-start">
              <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                You can escalate without selecting a target, but choosing a team or agent ensures
                the right person is notified.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isPending}
            className="gap-1.5"
          >
            {isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <AlertTriangle className="h-3.5 w-3.5" />}
            {isPending ? "Escalating…" : "Confirm Escalation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
