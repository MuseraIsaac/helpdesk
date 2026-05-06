/**
 * Settings → Updates page (Phase 3+).
 *
 * Tabs
 * ────
 *   Current   — installed version, what shipped in the running release.
 *   Available — Check / Apply flow + live progress for in-flight runs.
 *   History   — every recorded install / upgrade / downgrade transition.
 *   Channel   — release-server URL, channel, install-id, secret regen.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  Package, Download, History, RefreshCw, CheckCircle2, AlertTriangle,
  Sparkles, Database, FileWarning, Clock, Info, Loader2, Settings2,
  ArrowUpRight, ArrowDownRight, ShieldCheck, Copy, Check, Terminal,
  PlayCircle, XCircle, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import ErrorAlert from "@/components/ErrorAlert";
import { cn } from "@/lib/utils";
import type {
  CurrentVersionResponse, UpdateCheckResponse, AppVersionRecord,
  UpdateRunRecord, UpdateRunEventRecord,
} from "core/schemas/updates.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const KIND_META: Record<AppVersionRecord["kind"], { label: string; icon: React.ElementType; color: string }> = {
  install:    { label: "Initial install", icon: Package,         color: "text-blue-600 dark:text-blue-400"   },
  upgrade:    { label: "Upgrade",         icon: ArrowUpRight,    color: "text-emerald-600 dark:text-emerald-400" },
  downgrade:  { label: "Downgrade",       icon: ArrowDownRight,  color: "text-amber-600 dark:text-amber-400" },
  reinstall:  { label: "Reinstall",       icon: RefreshCw,       color: "text-muted-foreground" },
};

const STATE_LABEL: Record<UpdateRunRecord["state"], string> = {
  queued:           "Queued",
  preflight:        "Pre-flight checks",
  backup:           "Creating backup",
  maintenance_on:   "Enabling maintenance",
  fetch:            "Downloading",
  verify:           "Verifying",
  extract:          "Extracting artifact",
  install_deps:     "Installing dependencies",
  migrate:          "Running migrations",
  data_tasks:       "Running data tasks",
  build:            "Building frontend",
  finalize:         "Finalizing & restarting",
  restart_required: "Awaiting manual restart",
  done:             "Done",
  failed:           "Failed",
  cancelled:        "Cancelled",
  rolling_back:     "Rolling back",
  rolled_back:      "Rolled back",
};

const RUN_STEPS = [
  "preflight", "backup", "maintenance_on",
  "fetch", "verify", "extract",
  "install_deps", "migrate", "data_tasks", "build",
  "finalize",
] as const;

// ── Page ─────────────────────────────────────────────────────────────────────

export default function UpdatesPage() {
  const [tab, setTab] = useState<"current" | "available" | "history" | "channel">("current");

  const currentQuery = useQuery({
    queryKey: ["updates", "current"],
    queryFn: async () => (await axios.get<CurrentVersionResponse>("/api/updates/current")).data,
  });

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="bg-background border-b">
        <div className="px-6 pt-6 pb-5 flex items-start gap-3 max-w-5xl">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold tracking-tight">
              Updates
              <span className="text-muted-foreground font-normal text-base ml-2">system</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Track the version of Zentra Helpdesk running on this install and apply releases from your update channel.
            </p>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 max-w-5xl">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="mb-6">
            <TabsTrigger value="current"   className="gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" />Current</TabsTrigger>
            <TabsTrigger value="available" className="gap-1.5"><Download      className="h-3.5 w-3.5" />Available</TabsTrigger>
            <TabsTrigger value="history"   className="gap-1.5"><History       className="h-3.5 w-3.5" />History</TabsTrigger>
            <TabsTrigger value="channel"   className="gap-1.5"><Settings2     className="h-3.5 w-3.5" />Channel</TabsTrigger>
          </TabsList>

          <TabsContent value="current">
            {currentQuery.isLoading && <LoadingPanel />}
            {currentQuery.error && <ErrorAlert error={currentQuery.error as Error} fallback="Failed to load version info" />}
            {currentQuery.data && <CurrentTab data={currentQuery.data} />}
          </TabsContent>

          <TabsContent value="available">
            <AvailableTab />
          </TabsContent>

          <TabsContent value="history">
            <HistoryTab />
          </TabsContent>

          <TabsContent value="channel">
            <ChannelTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ── Current tab ──────────────────────────────────────────────────────────────

function CurrentTab({ data }: { data: CurrentVersionResponse }) {
  const { bundled, installed, pendingFinalize } = data;
  const channelColor =
    bundled.channel === "stable" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
    : bundled.channel === "beta" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
    :                              "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20";

  return (
    <div className="space-y-6">
      {pendingFinalize && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">Update applied — finalize pending</p>
            <p className="text-xs text-muted-foreground mt-1">
              The binary on disk is at <strong>{bundled.version}</strong> but the recorded install version is <strong>{installed?.version ?? "unknown"}</strong>.
              Restart the server to record the transition.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Running version</p>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-3xl font-bold tracking-tight tabular-nums">
                {installed?.version ?? bundled.version}
              </h2>
              <Badge variant="outline" className={cn("uppercase text-[10px] tracking-wider", channelColor)}>{bundled.channel}</Badge>
            </div>
            {installed && (
              <p className="text-xs text-muted-foreground">
                Installed {fmtDateTime(installed.appliedAt)}
                {installed.appliedBy && <> by <span className="text-foreground font-medium">{installed.appliedBy.name}</span></>}
              </p>
            )}
          </div>
          <div className="text-right space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Build</p>
            <p className="text-sm font-mono">{bundled.name ?? "Helpdesk"}</p>
            {bundled.publishedAt && (
              <p className="text-xs text-muted-foreground">
                Published {new Date(bundled.publishedAt).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            )}
          </div>
        </div>

        {bundled.highlights.length > 0 && (
          <>
            <Separator className="my-5" />
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />What's in this release
              </p>
              <ul className="space-y-1.5">
                {bundled.highlights.map((h, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {bundled.breakingChanges.length > 0 && (
          <>
            <Separator className="my-5" />
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1.5">
                <FileWarning className="h-3 w-3" />Breaking changes
              </p>
              <ul className="space-y-1.5">
                {bundled.breakingChanges.map((b, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Available tab ────────────────────────────────────────────────────────────

function AvailableTab() {
  const queryClient = useQueryClient();

  // Always show any in-flight run prominently — even before the user clicks Check.
  const inFlightQuery = useQuery({
    queryKey: ["updates", "runs", "live"],
    queryFn: async () => {
      const { data } = await axios.get<{ runs: UpdateRunRecord[] }>("/api/updates/runs?limit=1");
      const newest = data.runs[0];
      const isLive = newest && !["done", "failed", "cancelled", "rolled_back"].includes(newest.state);
      return isLive ? newest : null;
    },
    refetchInterval: 5_000,
  });

  const checkMutation = useMutation({
    mutationFn: async () => (await axios.get<UpdateCheckResponse>("/api/updates/check")).data,
  });

  const applyMutation = useMutation({
    mutationFn: async (toVersion: string) => {
      const { data } = await axios.post<{ runId: number }>("/api/updates/apply", {
        toVersion, skipMaintenanceWindow: false,
      });
      return data.runId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["updates", "runs", "live"] });
    },
  });

  const [confirmOpen, setConfirmOpen]   = useState(false);
  const [pendingVersion, setPending]    = useState<string | null>(null);

  if (inFlightQuery.data) {
    return <RunProgressPanel runId={inFlightQuery.data.id} initial={inFlightQuery.data} />;
  }

  const result = checkMutation.data;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h3 className="text-base font-semibold">Check for updates</h3>
            <p className="text-xs text-muted-foreground">
              Queries the configured release channel. Requests are signed with this install's HMAC secret.
            </p>
          </div>
          <Button onClick={() => checkMutation.mutate()} disabled={checkMutation.isPending} className="gap-1.5">
            {checkMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Check now
          </Button>
        </div>

        {result && (
          <>
            <Separator className="my-5" />
            <CheckResultPanel
              result={result}
              onApply={(v) => { setPending(v); setConfirmOpen(true); }}
            />
          </>
        )}

        {applyMutation.error && (
          <div className="mt-4">
            <ErrorAlert error={applyMutation.error as Error} fallback="Failed to start update" />
          </div>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply update {pendingVersion}?</AlertDialogTitle>
            <AlertDialogDescription>
              The system will enter maintenance mode while the update runs. Other users will see a 503 banner;
              admins continue to have access. Once migrations finish you'll need to restart the server to finalize.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingVersion) applyMutation.mutate(pendingVersion);
                setConfirmOpen(false);
              }}
            >
              Start update
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CheckResultPanel({
  result, onApply,
}: { result: UpdateCheckResponse; onApply: (v: string) => void }) {
  if (result.status === "ok") {
    return (
      <div className="flex items-center gap-2.5 text-sm">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        <span>You're on the latest version (<strong>{result.current}</strong>).</span>
      </div>
    );
  }
  if (result.status === "disabled") {
    return (
      <div className="flex items-start gap-2.5 text-sm">
        <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <div>
          <p>Update channel not configured yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Set the release-server URL on the Channel tab.</p>
        </div>
      </div>
    );
  }
  if (result.status === "available" && result.available) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2.5">
          <ArrowUpRight className="h-4 w-4 text-emerald-500" />
          <span className="text-sm">
            New version <strong>{result.latest}</strong> available
            {" — "}<span className="text-muted-foreground">you're on {result.current}</span>
          </span>
        </div>
        {result.available.highlights.length > 0 && (
          <ul className="space-y-1 ml-6 max-w-xl">
            {result.available.highlights.map((h, i) => (
              <li key={i} className="text-xs text-muted-foreground">• {h}</li>
            ))}
          </ul>
        )}
        {result.available.breakingChanges.length > 0 && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 ml-6 max-w-xl">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Breaking changes</p>
            <ul className="space-y-0.5">
              {result.available.breakingChanges.map((b, i) => (
                <li key={i} className="text-xs">• {b}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex items-center gap-2 ml-6 text-xs text-muted-foreground">
          {result.available.estimatedDurationMinutes > 0 && (
            <><Clock className="h-3 w-3" />~{result.available.estimatedDurationMinutes} min estimated</>
          )}
        </div>
        <div className="ml-6">
          <Button onClick={() => onApply(result.latest!)} className="gap-1.5">
            <PlayCircle className="h-3.5 w-3.5" />
            Apply update
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
      <div>
        <p>Check failed</p>
        {result.errorMessage && <p className="text-xs text-muted-foreground mt-1">{result.errorMessage}</p>}
      </div>
    </div>
  );
}

// ── Run progress panel ───────────────────────────────────────────────────────

function RunProgressPanel({ runId, initial }: { runId: number; initial: UpdateRunRecord }) {
  const [run, setRun]       = useState<UpdateRunRecord>(initial);
  const [events, setEvents] = useState<UpdateRunEventRecord[]>([]);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource(`/api/updates/runs/${runId}/stream`);
    es.addEventListener("state", (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as { state: UpdateRunRecord["state"]; currentStep: string | null };
      setRun(prev => ({ ...prev, state: data.state, currentStep: data.currentStep }));
    });
    es.addEventListener("log", (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as { id: number; level: string; step: string | null; message: string; createdAt: string };
      setEvents(prev => {
        if (prev.some(p => p.id === data.id)) return prev;
        return [...prev, {
          id: data.id, level: data.level as UpdateRunEventRecord["level"],
          step: data.step, message: data.message, data: null,
          createdAt: data.createdAt,
        }];
      });
    });
    es.addEventListener("done", () => es.close());
    es.onerror = () => es.close();
    return () => es.close();
  }, [runId]);

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  const isTerminal = ["done", "failed", "cancelled", "rolled_back"].includes(run.state);
  const isFailed   = run.state === "failed";
  const isDone     = run.state === "done" || run.state === "restart_required";

  return (
    <div className="space-y-6">
      <div className={cn("rounded-xl border p-6",
        isFailed ? "border-destructive/30 bg-destructive/5"
        : isDone ? "border-emerald-500/30 bg-emerald-500/5"
        : "border-blue-500/30 bg-blue-500/5",
      )}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {isFailed
                ? <XCircle className="h-5 w-5 text-destructive" />
                : isDone
                  ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  : <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />}
              <h3 className="text-base font-semibold">
                Update {run.fromVersion} → {run.toVersion}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              {STATE_LABEL[run.state]}{run.currentStep && run.state !== "done" && run.state !== "failed" ? ` · ${run.currentStep}` : ""}
            </p>
          </div>
          {!isTerminal && (
            <CancelButton runId={runId} state={run.state} />
          )}
        </div>

        {/* Step indicator */}
        <div className="mt-4 flex items-center gap-1.5 flex-wrap">
          {RUN_STEPS.map((step) => {
            const stepIdx    = RUN_STEPS.indexOf(step);
            const currentIdx = RUN_STEPS.indexOf(run.state as typeof RUN_STEPS[number]);
            const reached    = currentIdx >= stepIdx || (run.state === "done" || run.state === "restart_required");
            const isCurrent  = run.state === step;
            return (
              <div key={step} className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-medium border",
                isCurrent ? "border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-400"
                : reached  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "border-muted text-muted-foreground",
              )}>
                {step.replace(/_/g, " ")}
              </div>
            );
          })}
        </div>

        {run.errorMessage && (
          <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-xs font-semibold text-destructive">Failed at step: {run.errorStep}</p>
            <p className="text-xs mt-1 font-mono">{run.errorMessage}</p>
          </div>
        )}

        {run.state === "restart_required" && (
          <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
            <Terminal className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold">Restart the server to finalize</p>
              <p className="text-muted-foreground mt-1 font-mono">systemctl restart zentra-helpdesk</p>
              <p className="text-muted-foreground mt-1">Maintenance mode stays on until you toggle it off after restart.</p>
            </div>
          </div>
        )}
      </div>

      {/* Event log */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center gap-2 bg-muted/30">
          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold">Event log</span>
          <span className="text-xs text-muted-foreground ml-auto">{events.length} events</span>
        </div>
        <div className="max-h-96 overflow-y-auto p-1">
          {events.map(e => (
            <div key={e.id} className="px-4 py-1.5 flex items-start gap-2 text-xs">
              <span className="text-muted-foreground tabular-nums shrink-0 w-20">
                {new Date(e.createdAt).toLocaleTimeString("en", { hour12: false })}
              </span>
              <span className={cn("shrink-0 uppercase font-mono text-[10px] w-12",
                e.level === "error" ? "text-destructive"
                : e.level === "warn" ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground")}>
                {e.level}
              </span>
              {e.step && <span className="shrink-0 font-mono text-[10px] text-muted-foreground w-28 truncate">{e.step}</span>}
              <span className="break-all">{e.message}</span>
            </div>
          ))}
          <div ref={eventsEndRef} />
        </div>
      </div>
    </div>
  );
}

function CancelButton({ runId, state }: { runId: number; state: string }) {
  const queryClient = useQueryClient();
  const cancelMutation = useMutation({
    mutationFn: () => axios.post(`/api/updates/runs/${runId}/cancel`),
    onSuccess:  () => { queryClient.invalidateQueries({ queryKey: ["updates", "runs", "live"] }); },
  });
  const cancellable = ["queued", "preflight", "backup", "maintenance_on", "fetch", "verify", "extract", "install_deps"].includes(state);
  if (!cancellable) return null;
  return (
    <Button variant="outline" size="sm" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending} className="gap-1.5">
      {cancelMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
      Cancel
    </Button>
  );
}

// ── History tab ──────────────────────────────────────────────────────────────

function HistoryTab() {
  const versionsQuery = useQuery({
    queryKey: ["updates", "history"],
    queryFn: async () => (await axios.get<{ events: AppVersionRecord[] }>("/api/updates/history")).data.events,
  });

  const runsQuery = useQuery({
    queryKey: ["updates", "runs"],
    queryFn: async () => (await axios.get<{ runs: UpdateRunRecord[] }>("/api/updates/runs?limit=10")).data.runs,
  });

  if (versionsQuery.isLoading || runsQuery.isLoading) return <LoadingPanel />;

  const versions = versionsQuery.data ?? [];
  const runs     = runsQuery.data ?? [];

  if (versions.length === 0 && runs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/10 p-10 text-center">
        <History className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm font-medium">No transitions recorded yet</p>
        <p className="text-xs text-muted-foreground mt-1">Every install, upgrade, and downgrade will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {runs.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">Recent update runs</p>
          <div className="rounded-xl border bg-card overflow-hidden">
            <ul className="divide-y">
              {runs.map(run => (
                <li key={`run-${run.id}`} className="px-5 py-3 hover:bg-muted/20 text-xs flex items-center gap-3">
                  <RunStateIcon state={run.state} />
                  <span className="font-mono">#{run.id}</span>
                  <span>{run.fromVersion} → {run.toVersion}</span>
                  <span className="text-muted-foreground">{STATE_LABEL[run.state]}</span>
                  <span className="text-muted-foreground ml-auto">{fmtDateTime(run.createdAt)}</span>
                  {run.triggeredBy && <span className="text-muted-foreground">by {run.triggeredBy.name}</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {versions.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">Version history</p>
          <div className="rounded-xl border bg-card overflow-hidden">
            <ul className="divide-y">
              {versions.map(row => {
                const meta = KIND_META[row.kind];
                const Icon = meta.icon;
                return (
                  <li key={`v-${row.id}`} className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-muted", meta.color)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{meta.label}</span>
                          <span className="text-xs text-muted-foreground">→</span>
                          <span className="text-sm font-mono">{row.version}</span>
                          {row.fromVersion && <span className="text-xs text-muted-foreground">from <span className="font-mono">{row.fromVersion}</span></span>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {fmtDateTime(row.appliedAt)}
                          {row.appliedBy ? <> · by <span className="text-foreground font-medium">{row.appliedBy.name}</span></> : <> · automatic (boot)</>}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function RunStateIcon({ state }: { state: UpdateRunRecord["state"] }) {
  if (state === "done") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (state === "failed" || state === "cancelled") return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  if (state === "restart_required") return <Terminal className="h-3.5 w-3.5 text-amber-500" />;
  return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />;
}

// ── Channel tab ──────────────────────────────────────────────────────────────

interface ChannelView {
  baseUrl: string;
  channel: string;
  autoCheck: string;
  installId: string;
  lastCheckedAt: string;
  lastError: string;
  hasSecret: boolean;
  enrolled: boolean;
  licenseName: string;
  licenseExpires: string;
  enrolledAt: string;
}

function ChannelTab() {
  const queryClient = useQueryClient();

  const cfgQuery = useQuery({
    queryKey: ["updates", "channel"],
    queryFn: async () => (await axios.get<ChannelView>("/api/updates/channel")).data,
  });

  const [baseUrl, setBaseUrl]     = useState("");
  const [channel, setChannel]     = useState("stable");
  const [autoCheck, setAutoCheck] = useState("daily");
  const [licenseKey, setLicense]  = useState("");
  const [enrollErr, setEnrollErr] = useState<string | null>(null);

  useEffect(() => {
    if (cfgQuery.data) {
      setBaseUrl(cfgQuery.data.baseUrl ?? "");
      setChannel(cfgQuery.data.channel);
      setAutoCheck(cfgQuery.data.autoCheck);
    }
  }, [cfgQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => (await axios.patch<ChannelView>("/api/updates/channel", { baseUrl, channel, autoCheck })).data,
    onSuccess:  () => { queryClient.invalidateQueries({ queryKey: ["updates", "channel"] }); },
  });

  const enrollMutation = useMutation({
    mutationFn: async (key: string) => (await axios.post<ChannelView>("/api/updates/channel/enroll", { licenseKey: key })).data,
    onSuccess:  () => {
      setLicense("");
      setEnrollErr(null);
      queryClient.invalidateQueries({ queryKey: ["updates", "channel"] });
    },
    onError: (err) => {
      const msg = (err as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error
                ?? (err as Error).message ?? "Activation failed";
      setEnrollErr(msg);
    },
  });

  const unenrollMutation = useMutation({
    mutationFn: async () => (await axios.post<ChannelView>("/api/updates/channel/unenroll")).data,
    onSuccess:  () => { queryClient.invalidateQueries({ queryKey: ["updates", "channel"] }); },
  });

  if (cfgQuery.isLoading || !cfgQuery.data) return <LoadingPanel />;
  const cfg = cfgQuery.data;

  const formatLicenseInput = (raw: string) => {
    // Accept any combination of dashes/spaces and re-format to ZNTR-XXXX-XXXX-XXXX-XXXX (uppercase).
    const cleaned = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const head = cleaned.slice(0, 4);
    const rest = cleaned.slice(4);
    const groups = [];
    for (let i = 0; i < rest.length; i += 4) groups.push(rest.slice(i, i + 4));
    return [head, ...groups].filter(Boolean).join("-").slice(0, 24);
  };

  const canActivate = !!cfg.baseUrl && /^ZNTR-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(licenseKey);

  return (
    <div className="space-y-6">
      {/* ── License status card ─────────────────────────────────────────── */}
      <div className={cn(
        "rounded-xl border p-6 space-y-4",
        cfg.enrolled ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5",
      )}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            {cfg.enrolled
              ? <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
              : <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />}
            <div>
              <h3 className="text-base font-semibold">
                {cfg.enrolled ? "Licensed" : "License required"}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {cfg.enrolled
                  ? <>This install is authorized to receive updates from <strong>{cfg.baseUrl || "the release server"}</strong>.</>
                  : "Paste the license key your provider sent you to activate update access."}
              </p>
            </div>
          </div>
          {cfg.enrolled && (
            <Button variant="outline" size="sm" onClick={() => unenrollMutation.mutate()} disabled={unenrollMutation.isPending}>
              {unenrollMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Deactivate
            </Button>
          )}
        </div>

        {cfg.enrolled ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">License</p>
              <p className="text-sm font-medium mt-0.5">{cfg.licenseName || "Unnamed"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Expires</p>
              <p className="text-sm font-medium mt-0.5">
                {cfg.licenseExpires ? new Date(cfg.licenseExpires).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" }) : "Never"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Activated</p>
              <p className="text-sm font-medium mt-0.5">{cfg.enrolledAt ? fmtDateTime(cfg.enrolledAt) : "—"}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="licenseKey" className="text-xs">License key</Label>
              <Input
                id="licenseKey"
                value={licenseKey}
                onChange={e => { setLicense(formatLicenseInput(e.target.value)); setEnrollErr(null); }}
                placeholder="ZNTR-XXXX-XXXX-XXXX-XXXX"
                className="font-mono uppercase tracking-wider"
                spellCheck={false}
                autoComplete="off"
              />
              <p className="text-[10px] text-muted-foreground">
                Set the release server URL below first. Then paste the key your provider issued you.
              </p>
            </div>
            {enrollErr && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 flex items-start gap-2">
                <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs">{translateEnrollError(enrollErr)}</p>
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button onClick={() => enrollMutation.mutate(licenseKey)} disabled={!canActivate || enrollMutation.isPending}>
                {enrollMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                Activate license
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Channel settings card ───────────────────────────────────────── */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <h3 className="text-base font-semibold">Release channel</h3>
            <p className="text-xs text-muted-foreground">
              Where this install pulls updates from. All requests are signed with a per-install HMAC secret
              that the release server issued during activation.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="baseUrl" className="text-xs">Release server URL</Label>
            <Input
              id="baseUrl"
              type="url"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://zentraitsm.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="channel" className="text-xs">Channel</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger id="channel"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="stable">Stable</SelectItem>
                <SelectItem value="beta">Beta</SelectItem>
                <SelectItem value="nightly">Nightly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="autoCheck" className="text-xs">Auto-check</Label>
            <Select value={autoCheck} onValueChange={setAutoCheck}>
              <SelectTrigger id="autoCheck"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          {saveMutation.isSuccess && <span className="text-xs text-emerald-600">Saved</span>}
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} size="sm">
            {saveMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            Save
          </Button>
        </div>

        {cfg.lastCheckedAt && (
          <div className="pt-3 border-t text-xs text-muted-foreground">
            Last check: {fmtDateTime(cfg.lastCheckedAt)}
            {cfg.lastError && <span className="text-destructive ml-2">— {cfg.lastError}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function translateEnrollError(raw: string): string {
  switch (raw) {
    case "license-invalid":      return "That license key isn't recognised. Check for typos.";
    case "license-revoked":      return "This license has been revoked. Contact your provider.";
    case "license-expired":      return "This license has expired. Renew with your provider.";
    case "seat-limit-reached":   return "All seats on this license are already in use. Free a seat or buy more.";
    case "bad-license-format":   return "Format must be ZNTR-XXXX-XXXX-XXXX-XXXX.";
    case "too-many-attempts":    return "Too many activation attempts. Try again in an hour.";
    default:                     return raw;
  }
}

// ── Shared ───────────────────────────────────────────────────────────────────

function LoadingPanel() {
  return (
    <div className="rounded-xl border bg-card p-6 space-y-3">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-64" />
      <Separator className="my-3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}
