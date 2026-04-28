/**
 * RunScenarioButton — lets an agent invoke a scenario on the current ticket.
 *
 * Always rendered (even when no scenarios exist), with a searchable popover,
 * inline result feedback, and a shortcut to create a new scenario automation.
 *
 * variant="header"  → compact button for the ticket page top-right corner
 * variant="sidebar" → full-width button for the right sidebar
 */

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Zap, ChevronDown, CheckCircle2, AlertCircle, Loader2,
  Search, Plus, PlayCircle, ExternalLink, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ScenarioAction {
  type: string;
  [key: string]: unknown;
}

interface Scenario {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  isEnabled: boolean;
  actions: ScenarioAction[];
}

interface RunResult {
  executionId: number;
  status: "completed" | "failed";
  results: Array<{
    type: string;
    applied: boolean;
    skippedReason?: string;
    errorMessage?: string;
  }>;
}

interface RunScenarioButtonProps {
  ticketId: number;
  variant?: "header" | "sidebar";
  /** Called when the user clicks "Create new scenario automation" — opens the sheet. */
  onOpenSheet?: (tab?: "run" | "create" | "manage") => void;
}

export default function RunScenarioButton({
  ticketId,
  variant = "sidebar",
  onOpenSheet,
}: RunScenarioButtonProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [lastResult, setLastResult] = useState<RunResult | null>(null);
  const [runningId, setRunningId] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const isHeader = variant === "header";

  const { data, isLoading } = useQuery({
    queryKey: ["scenarios"],
    queryFn: async () => {
      const { data } = await axios.get<{ scenarios: Scenario[] }>("/api/scenarios");
      return data;
    },
  });

  const scenarios = (data?.scenarios ?? []).filter((s) => s.isEnabled);

  const filtered = search.trim()
    ? scenarios.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.description?.toLowerCase().includes(search.toLowerCase())
      )
    : scenarios;

  const runMutation = useMutation({
    mutationFn: async ({ scenarioId }: { scenarioId: number }) => {
      const { data } = await axios.post<RunResult>(
        `/api/scenarios/${scenarioId}/run`,
        { ticketId }
      );
      return data;
    },
    onSuccess: (result) => {
      setLastResult(result);
      setRunningId(null);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["ticket", String(ticketId)] });
    },
    onError: () => {
      setRunningId(null);
    },
  });

  const handleRun = (scenarioId: number) => {
    setRunningId(scenarioId);
    setLastResult(null);
    runMutation.mutate({ scenarioId });
  };

  // Focus search when popover opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [open]);

  const appliedCount = lastResult?.results.filter((r) => r.applied).length ?? 0;
  const hasError = lastResult?.results.some((r) => r.errorMessage);

  return (
    <div className={cn(isHeader ? "flex flex-col items-end gap-1.5" : "space-y-2")}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "gap-2 font-medium transition-all",
              isHeader ? "h-9 px-3 text-sm" : "w-full h-8 text-xs justify-between",
              open && "border-amber-400/60 bg-amber-50/50 dark:bg-amber-950/20",
            )}
            disabled={runMutation.isPending}
          >
            <span className="flex items-center gap-1.5">
              {runMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
              ) : (
                <Zap
                  className={cn(
                    "h-3.5 w-3.5 transition-colors",
                    open ? "text-amber-500" : "text-amber-400",
                  )}
                />
              )}
              Run Scenario
            </span>
            <ChevronDown
              className={cn(
                "h-3 w-3 text-muted-foreground transition-transform duration-150",
                open && "rotate-180",
              )}
            />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align={isHeader ? "end" : "start"}
          side="bottom"
          sideOffset={6}
          className="w-80 p-0 shadow-xl border-border/80 overflow-hidden"
        >
          {/* Header */}
          <div className="px-3 pt-3 pb-2 bg-gradient-to-b from-amber-500/5 to-transparent border-b border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-6 w-6 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <Zap className="h-3.5 w-3.5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs font-semibold leading-tight">Scenario Automations</p>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  {scenarios.length === 0
                    ? "No active automations"
                    : `${scenarios.length} available`}
                </p>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search scenarios…"
                className="h-7 pl-8 text-xs border-border/60 bg-background/80 focus-visible:ring-amber-500/30"
              />
            </div>
          </div>

          {/* Scenario list */}
          <div className="max-h-[260px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs">Loading…</span>
              </div>
            ) : filtered.length > 0 ? (
              <div className="py-1">
                {filtered.map((scenario) => {
                  const isRunning = runningId === scenario.id;
                  return (
                    <button
                      key={scenario.id}
                      className={cn(
                        "w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors",
                        "hover:bg-accent/60 focus:bg-accent/60 focus:outline-none",
                        isRunning && "opacity-60 pointer-events-none",
                      )}
                      onClick={() => handleRun(scenario.id)}
                      disabled={isRunning || runMutation.isPending}
                    >
                      {/* Color dot */}
                      <div className="mt-0.5 shrink-0">
                        <span
                          className="flex h-5 w-5 items-center justify-center rounded-full border"
                          style={{
                            backgroundColor: `${scenario.color ?? "#f59e0b"}20`,
                            borderColor: `${scenario.color ?? "#f59e0b"}50`,
                          }}
                        >
                          {isRunning ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" style={{ color: scenario.color ?? "#f59e0b" }} />
                          ) : (
                            <PlayCircle className="h-2.5 w-2.5" style={{ color: scenario.color ?? "#f59e0b" }} />
                          )}
                        </span>
                      </div>

                      {/* Name + description */}
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] font-medium leading-tight truncate">{scenario.name}</p>
                          <Badge
                            variant="secondary"
                            className="text-[9px] px-1 py-0 h-4 shrink-0 font-medium"
                          >
                            {scenario.actions.length}
                          </Badge>
                        </div>
                        {scenario.description && (
                          <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                            {scenario.description}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : search ? (
              /* No search results */
              <div className="flex flex-col items-center gap-2 py-8 text-center px-4">
                <Search className="h-6 w-6 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">
                  No scenarios match <span className="font-medium text-foreground">"{search}"</span>
                </p>
              </div>
            ) : (
              /* Empty state — no scenarios at all */
              <div className="flex flex-col items-center gap-3 py-8 px-4 text-center">
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-amber-400" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium">No active scenarios yet</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Scenario automations let you apply multi-step actions to tickets in one click.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer — always present */}
          <Separator />
          <div className="p-1.5 space-y-0.5">
            <button
              type="button"
              onClick={() => { setOpen(false); onOpenSheet?.("create"); }}
              className={cn(
                "flex items-center gap-2.5 w-full rounded-md px-2.5 py-2 text-xs transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-accent/60",
              )}
            >
              <div className="h-5 w-5 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <Plus className="h-3 w-3 text-amber-500" />
              </div>
              <span className="font-medium">Create new scenario automation</span>
            </button>
            {scenarios.length > 0 && (
              <button
                type="button"
                onClick={() => { setOpen(false); onOpenSheet?.("manage"); }}
                className={cn(
                  "flex items-center gap-2.5 w-full rounded-md px-2.5 py-2 text-xs transition-colors",
                  "text-muted-foreground hover:text-foreground hover:bg-accent/60",
                )}
              >
                <div className="h-5 w-5 rounded-md bg-muted/60 flex items-center justify-center shrink-0">
                  <ExternalLink className="h-3 w-3" />
                </div>
                <span className="font-medium">Manage all scenarios</span>
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Result / error feedback — shown below the button */}
      {lastResult && (
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] animate-in fade-in-0 slide-in-from-top-1 duration-200",
            hasError
              ? "bg-destructive/10 text-destructive border border-destructive/20"
              : "bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20",
          )}
        >
          {hasError ? (
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="font-medium">
            {hasError
              ? "Completed with errors"
              : appliedCount === 0
              ? "No changes needed"
              : `${appliedCount} action${appliedCount !== 1 ? "s" : ""} applied`}
          </span>
        </div>
      )}

      {runMutation.isError && !lastResult && (
        <div className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] bg-destructive/10 text-destructive border border-destructive/20 animate-in fade-in-0 duration-150">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>
            {axios.isAxiosError(runMutation.error)
              ? (runMutation.error.response?.data as { error?: string })?.error ??
                "Failed to run scenario"
              : "Failed to run scenario"}
          </span>
        </div>
      )}
    </div>
  );
}
