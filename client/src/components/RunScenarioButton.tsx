/**
 * RunScenarioButton — lets an agent invoke a scenario on the current ticket.
 *
 * Renders a "Run Scenario" dropdown. Each available (enabled) scenario appears
 * as a clickable item. Clicking one POSTs to /api/scenarios/:id/run, shows a
 * loading state, then invalidates the ticket query so the UI refreshes with
 * any field changes the scenario applied.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Zap, ChevronDown, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

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
}

export default function RunScenarioButton({ ticketId }: RunScenarioButtonProps) {
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState<RunResult | null>(null);
  const [runningId, setRunningId] = useState<number | null>(null);

  const { data } = useQuery({
    queryKey: ["scenarios"],
    queryFn: async () => {
      const { data } = await axios.get<{ scenarios: Scenario[] }>("/api/scenarios");
      return data;
    },
  });

  const scenarios = (data?.scenarios ?? []).filter((s) => s.isEnabled);

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
      // Refresh ticket to pick up any field changes
      void queryClient.invalidateQueries({ queryKey: ["ticket", String(ticketId)] });
    },
    onError: () => {
      setRunningId(null);
    },
  });

  if (scenarios.length === 0) return null;

  const handleRun = (scenarioId: number) => {
    setRunningId(scenarioId);
    setLastResult(null);
    runMutation.mutate({ scenarioId });
  };

  const appliedCount = lastResult?.results.filter((r) => r.applied).length ?? 0;
  const hasError = lastResult?.results.some((r) => r.errorMessage);

  return (
    <div className="space-y-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 gap-1.5 text-xs justify-between"
            disabled={runMutation.isPending}
          >
            <span className="flex items-center gap-1.5">
              {runMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
              Run Scenario
            </span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {scenarios.map((scenario, idx) => (
            <div key={scenario.id}>
              {idx > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                className="flex flex-col items-start gap-0.5 py-2 cursor-pointer"
                disabled={runningId === scenario.id}
                onClick={() => handleRun(scenario.id)}
              >
                <div className="flex items-center gap-2 w-full">
                  {scenario.color && (
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: scenario.color }}
                    />
                  )}
                  <span className="font-medium text-[13px] flex-1">{scenario.name}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {scenario.actions.length} action{scenario.actions.length !== 1 ? "s" : ""}
                  </Badge>
                </div>
                {scenario.description && (
                  <p className="text-[11px] text-muted-foreground pl-4 leading-snug">
                    {scenario.description}
                  </p>
                )}
              </DropdownMenuItem>
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Inline result feedback */}
      {lastResult && (
        <div
          className={`flex items-start gap-1.5 rounded-md px-2.5 py-2 text-[11px] ${
            hasError
              ? "bg-destructive/10 text-destructive"
              : "bg-green-500/10 text-green-700 dark:text-green-400"
          }`}
        >
          {hasError ? (
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          )}
          <span>
            {hasError
              ? "Scenario completed with errors"
              : appliedCount === 0
              ? "No changes needed — all actions already applied"
              : `${appliedCount} action${appliedCount !== 1 ? "s" : ""} applied`}
          </span>
        </div>
      )}

      {runMutation.isError && (
        <p className="text-[11px] text-destructive px-0.5">
          {axios.isAxiosError(runMutation.error)
            ? (runMutation.error.response?.data as { error?: string })?.error ??
              "Failed to run scenario"
            : "Failed to run scenario"}
        </p>
      )}
    </div>
  );
}
