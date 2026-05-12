/**
 * InfrastructureSection — Settings → Infrastructure
 *
 * Lets an admin scale the systemd API replica template between 1 and 4
 * live, with visual feedback for each node and a streaming progress log
 * while changes apply. Talks to /api/admin/replicas (see
 * server/src/routes/admin-replicas.ts).
 *
 * The UI degrades gracefully when the privileged helper isn't installed:
 * the apply button is disabled and we surface the operator-facing
 * `reason` plus a copy-paste install command.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios, { type AxiosError } from "axios";
import {
  CircleCheck,
  CircleAlert,
  CircleSlash,
  Minus,
  Plus,
  Zap,
  ShieldAlert,
  Database,
  Cpu,
  Activity,
  Loader2,
  Sparkles,
  Network,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import ErrorAlert from "@/components/ErrorAlert";
import { cn } from "@/lib/utils";

// ── Types (mirror server/src/routes/admin-replicas.ts) ───────────────────────

interface ReplicaNode {
  port:    number;
  enabled: boolean;
  active:  boolean;
  healthy: boolean;
  self:    boolean;
}
interface HelperStatus {
  helperPath:   string;
  helperExists: boolean;
  sudoNoPass:   boolean;
  reason:       string | null;
}
interface ReplicaState {
  basePort: number;
  max:      number;
  current:  number;
  replicas: ReplicaNode[];
  helper:   HelperStatus;
}

interface LogEntry {
  id:    number;
  level: "info" | "warn" | "error";
  text:  string;
}

// Approximate per-replica DB connection footprint, sourced from
// server/src/db.ts (Prisma pool=40) + server/src/lib/queue.ts (pg-boss=5).
const CONNECTIONS_PER_REPLICA = 45;
const POSTGRES_MAX_CONNECTIONS_DEFAULT = 200;

export default function InfrastructureSection() {
  // ── Data ───────────────────────────────────────────────────────────────────
  const [applying, setApplying] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "replicas"],
    queryFn: async (): Promise<ReplicaState> => (await axios.get<ReplicaState>("/api/admin/replicas")).data,
    refetchInterval: applying ? false : 7_000,
    refetchOnWindowFocus: !applying,
  });

  // ── Local UI state ─────────────────────────────────────────────────────────
  const [target, setTarget] = useState<number | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const logIdRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  // Initialize the target slider from server state once it loads, but never
  // overwrite an in-flight user choice.
  useEffect(() => {
    if (data && target === null) setTarget(data.current);
  }, [data, target]);

  // Auto-scroll the log to bottom on each new line.
  useEffect(() => { logEndRef.current?.scrollIntoView({ block: "end" }); }, [log]);

  if (isLoading || !data) return <InfrastructureSkeleton />;
  if (error)              return <ErrorAlert error={error as Error} fallback="Failed to load replica state" />;

  const current   = data.current;
  const max       = Math.min(data.max, 4); // hard UI cap
  const min       = 1;
  const desired   = target ?? current;
  const helperOk  = data.helper.helperExists && data.helper.sudoNoPass;
  const dirty     = desired !== current;
  const canApply  = helperOk && dirty && !applying;
  // max is at most 4, so a plain Array.from each render is cheaper than the
  // bookkeeping useMemo would do — and it sidesteps the hooks-after-return
  // pitfall (early returns above for loading/error states).
  const ports     = Array.from({ length: max }, (_, i) => data.basePort + i);

  // ── Capacity math ──────────────────────────────────────────────────────────
  const dbCap         = POSTGRES_MAX_CONNECTIONS_DEFAULT;
  const usedCurrent   = current * CONNECTIONS_PER_REPLICA;
  const usedTarget    = desired * CONNECTIONS_PER_REPLICA;
  const usedPctTarget = Math.min(100, Math.round((usedTarget / dbCap) * 100));

  // ── Actions ────────────────────────────────────────────────────────────────
  const apply = async () => {
    if (!helperOk || target === null) return;
    setApplying(true);
    setApplyError(null);
    setLog([]);
    pushLog("info", `→ scaling to ${target} replica${target === 1 ? "" : "s"}…`);

    try {
      const res = await fetch("/api/admin/replicas", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ target }),
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        setApplyError(text || `HTTP ${res.status}`);
        pushLog("error", `Apply failed: HTTP ${res.status}`);
        return;
      }
      await readNdjson(res.body, (obj) => handleEvent(obj, pushLog));
      pushLog("info", "✓ done");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setApplyError(message);
      pushLog("error", message);
    } finally {
      setApplying(false);
      refetch();
    }
  };

  function pushLog(level: LogEntry["level"], text: string) {
    setLog((prev) => [...prev, { id: ++logIdRef.current, level, text }]);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl space-y-8">

      {/* Section header — matches sibling sections' typographic rhythm */}
      <div className="space-y-1">
        <h2 className="text-base font-semibold tracking-tight">Infrastructure</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Scale the API replica template between {min} and {max} instances. Each replica
          runs as its own systemd unit and shares the database connection pool — changes
          apply live without dropping in-flight requests.
        </p>
      </div>

      {!helperOk && (
        <HelperUnavailableBanner status={data.helper} />
      )}

      {/* ── Topology hero ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-background via-background to-primary/[0.03]">
        {/* Decorative grid backdrop */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="relative px-6 pt-6 pb-7">
          {/* Hero header */}
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
                <Network className="size-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold tracking-tight">Runtime topology</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Live view of API replicas on this host
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill state={data} />
            </div>
          </div>

          {/* Replica nodes — one card per slot 1..max */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {ports.map((port, i) => {
              const slot     = i + 1;
              const node     = data.replicas.find((r) => r.port === port);
              const inTarget = slot <= desired;
              const inCur    = slot <= current;
              return (
                <NodeCard
                  key={port}
                  port={port}
                  slot={slot}
                  node={node}
                  inCurrent={inCur}
                  inTarget={inTarget}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Target picker + capacity ──────────────────────────────────────── */}
      <div className="grid lg:grid-cols-[1fr_320px] gap-5">

        {/* Target stepper */}
        <div className="rounded-xl border bg-background p-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-sm font-semibold tracking-tight flex items-center gap-2">
                <Sparkles className="size-3.5 text-primary" />
                Desired replica count
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Drag the dial or use ± to choose. {dirty
                  ? <span className="text-primary font-medium">{desired - current > 0 ? `+${desired - current}` : `${desired - current}`} from current</span>
                  : "No change pending"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                disabled={desired <= min || applying}
                onClick={() => setTarget(Math.max(min, desired - 1))}
                aria-label="Decrease replica count"
              >
                <Minus className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                disabled={desired >= max || applying}
                onClick={() => setTarget(Math.min(max, desired + 1))}
                aria-label="Increase replica count"
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          </div>

          {/* Segmented number selector — the visual centerpiece */}
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
              const isCurrent = n === current;
              const isTarget  = n === desired;
              return (
                <button
                  key={n}
                  type="button"
                  disabled={applying}
                  onClick={() => setTarget(n)}
                  className={cn(
                    "group relative overflow-hidden rounded-lg border p-4 text-left transition-all",
                    "hover:border-primary/40 hover:shadow-sm",
                    isTarget
                      ? "border-primary bg-primary/[0.06] shadow-sm"
                      : "border-border bg-background",
                    applying && "opacity-60 cursor-not-allowed",
                  )}
                >
                  {/* Subtle ring when targeted */}
                  {isTarget && (
                    <div aria-hidden className="absolute inset-0 ring-1 ring-inset ring-primary/30 rounded-lg pointer-events-none" />
                  )}
                  <div className="relative flex items-baseline gap-1.5">
                    <span className={cn(
                      "text-2xl font-bold tabular-nums transition-colors",
                      isTarget ? "text-primary" : "text-foreground",
                    )}>
                      {n}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {n === 1 ? "replica" : "replicas"}
                    </span>
                  </div>
                  <div className="relative mt-2 flex flex-wrap gap-1">
                    {isCurrent && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        <span className="size-1 rounded-full bg-emerald-500" />
                        Current
                      </span>
                    )}
                    {isTarget && !isCurrent && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-primary">
                        <span className="size-1 rounded-full bg-primary" />
                        Target
                      </span>
                    )}
                  </div>
                  <p className="relative mt-1.5 text-[10px] text-muted-foreground leading-snug">
                    {capacityBlurb(n)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Capacity meter */}
        <div className="rounded-xl border bg-background p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Database className="size-3.5 text-muted-foreground" />
            <h3 className="text-sm font-semibold tracking-tight">DB connection budget</h3>
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[11px] text-muted-foreground">
                Target uses <span className="font-semibold tabular-nums text-foreground">{usedTarget}</span> / {dbCap}
              </span>
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-wider",
                usedPctTarget < 60 ? "text-emerald-600 dark:text-emerald-400"
                  : usedPctTarget < 85 ? "text-amber-600 dark:text-amber-400"
                  : "text-destructive",
              )}>
                {usedPctTarget}%
              </span>
            </div>
            {/* Capacity bar with current overlay */}
            <div className="relative h-2 rounded-full bg-muted/60 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-muted-foreground/30"
                style={{ width: `${Math.min(100, (usedCurrent / dbCap) * 100)}%` }}
                aria-label="Current usage"
              />
              <div
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full transition-all",
                  usedPctTarget < 60 ? "bg-emerald-500"
                    : usedPctTarget < 85 ? "bg-amber-500"
                    : "bg-destructive",
                )}
                style={{ width: `${usedPctTarget}%` }}
                aria-label="Target usage"
              />
            </div>
            <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-muted-foreground/30" /> current
              </span>
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-primary" /> target
              </span>
            </div>
          </div>
          <div className="rounded-md bg-muted/30 p-3 space-y-1">
            <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Math</p>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Each replica holds <span className="font-mono text-foreground">{CONNECTIONS_PER_REPLICA}</span> Postgres
              connections (40 Prisma + 5 pg-boss). Assumes <span className="font-mono text-foreground">max_connections={dbCap}</span>.
              Lower <span className="font-mono text-foreground">DATABASE_POOL_MAX</span> in <span className="font-mono text-foreground">server/.env</span> to fit more replicas.
            </p>
          </div>
        </div>
      </div>

      {/* ── Apply footer ──────────────────────────────────────────────────── */}
      <div className={cn(
        "flex items-center justify-between rounded-xl border px-5 py-3 transition-all duration-200",
        dirty && helperOk
          ? "bg-primary/5 border-primary/20 shadow-sm"
          : "bg-muted/30 border-transparent",
      )}>
        <div className="flex items-center gap-2 text-sm">
          {applying ? (
            <span className="flex items-center gap-2 text-muted-foreground text-xs">
              <Loader2 className="size-3.5 animate-spin" />
              Scaling replicas…
            </span>
          ) : !helperOk ? (
            <span className="flex items-center gap-2 text-muted-foreground/70 text-xs">
              <ShieldAlert className="size-3.5" />
              Helper not available — see banner above
            </span>
          ) : dirty ? (
            <span className="text-xs text-muted-foreground">
              About to scale from <span className="font-semibold text-foreground tabular-nums">{current}</span> → <span className="font-semibold text-primary tabular-nums">{desired}</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/50">No pending changes</span>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!canApply}
          onClick={() => setConfirmOpen(true)}
          className={cn("gap-1.5 transition-all", !canApply && "opacity-50")}
        >
          <Zap className="size-3.5" />
          {applying ? "Applying…" : "Apply changes"}
        </Button>
      </div>

      {/* ── Live log (only while applying or after most-recent apply) ─────── */}
      {log.length > 0 && (
        <div className="rounded-xl border bg-zinc-950 dark:bg-black text-zinc-100 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-900/60">
            <Terminal className="size-3.5 text-zinc-400" />
            <span className="text-[11px] font-semibold tracking-tight">Apply log</span>
            {applying && <Loader2 className="size-3 animate-spin text-zinc-400 ml-auto" />}
          </div>
          <div className="max-h-64 overflow-y-auto px-4 py-3 font-mono text-[11px] space-y-0.5">
            {log.map((entry) => (
              <div
                key={entry.id}
                className={cn(
                  "leading-snug",
                  entry.level === "error" ? "text-red-400"
                    : entry.level === "warn" ? "text-amber-300"
                    : "text-zinc-300",
                )}
              >
                {entry.text}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {applyError && <ErrorAlert message={applyError} />}

      {/* ── Confirm dialog ───────────────────────────────────────────────── */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Zap className="size-4 text-primary" />
              Apply replica change
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Scale from <strong className="text-foreground">{current}</strong> to{" "}
                  <strong className="text-primary">{desired}</strong> replica{desired === 1 ? "" : "s"}.
                </p>
                <p className="text-xs">
                  {desired > current
                    ? `${desired - current} new systemd unit${desired - current === 1 ? "" : "s"} will be enabled and started on port${desired - current === 1 ? "" : "s"} ${Array.from({ length: desired - current }, (_, i) => data.basePort + current + i).join(", ")}.`
                    : `${current - desired} systemd unit${current - desired === 1 ? "" : "s"} will be stopped and disabled. The base replica on port ${data.basePort} is never touched.`}
                </p>
                <p className="text-xs">
                  In-flight requests on retained replicas continue uninterrupted.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOpen(false); apply(); }}>
              Apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatusPill({ state }: { state: ReplicaState }) {
  const healthy = state.replicas.filter((r) => r.healthy).length;
  const total   = state.current;
  const ok      = healthy === total && total > 0;
  return (
    <div className={cn(
      "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
      ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/20"
         : "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/20",
    )}>
      <Activity className="size-3" />
      {healthy}/{total} online
    </div>
  );
}

function NodeCard({
  port, slot, node, inCurrent, inTarget,
}: {
  port: number;
  slot: number;
  node: ReplicaNode | undefined;
  inCurrent: boolean;
  inTarget:  boolean;
}) {
  // Three primary states the card represents:
  //   • running       — enabled today AND healthy probe
  //   • running-warn  — enabled but unhealthy probe (degraded)
  //   • dimmed-target — not enabled today but will be after Apply
  //   • dimmed-shrink — enabled today but will be removed after Apply
  //   • inactive      — neither enabled nor targeted
  const state: "running" | "running-warn" | "target-add" | "target-remove" | "inactive" =
      inCurrent && node?.healthy   ? "running"
    : inCurrent && !node?.healthy  ? "running-warn"
    : !inCurrent && inTarget       ? "target-add"
    : inCurrent && !inTarget       ? "target-remove"
    : "inactive";

  const isPending = state === "target-add" || state === "target-remove";

  return (
    <div className={cn(
      "relative overflow-hidden rounded-lg border p-3 transition-all",
      state === "running"        && "border-emerald-500/30 bg-emerald-500/[0.04]",
      state === "running-warn"   && "border-amber-500/30 bg-amber-500/[0.04]",
      state === "target-add"     && "border-primary/40 bg-primary/[0.04] border-dashed",
      state === "target-remove"  && "border-destructive/30 bg-destructive/[0.04] border-dashed",
      state === "inactive"       && "border-muted bg-muted/20 opacity-60",
    )}>
      {/* Top row: slot + indicator */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground">
          Slot {slot}
        </span>
        {state === "running"       && <CircleCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />}
        {state === "running-warn"  && <CircleAlert className="size-3.5 text-amber-600 dark:text-amber-400" />}
        {state === "target-add"    && <Plus       className="size-3.5 text-primary" />}
        {state === "target-remove" && <Minus      className="size-3.5 text-destructive" />}
        {state === "inactive"      && <CircleSlash className="size-3.5 text-muted-foreground/40" />}
      </div>

      {/* Port */}
      <div className="mt-2 flex items-baseline gap-1.5">
        <Cpu className={cn(
          "size-3.5",
          state === "inactive" ? "text-muted-foreground/40"
            : state === "target-remove" ? "text-destructive/70"
            : state === "target-add" ? "text-primary/70"
            : "text-foreground/70",
        )} />
        <span className="text-base font-bold tabular-nums tracking-tight">
          {port}
        </span>
      </div>

      {/* Status label */}
      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
        <span className={cn(
          "text-[10px] font-medium",
          state === "running"        && "text-emerald-700 dark:text-emerald-400",
          state === "running-warn"   && "text-amber-700 dark:text-amber-400",
          state === "target-add"     && "text-primary",
          state === "target-remove"  && "text-destructive",
          state === "inactive"       && "text-muted-foreground/60",
        )}>
          {state === "running"        && "Online"}
          {state === "running-warn"   && "Unhealthy"}
          {state === "target-add"     && "Will start"}
          {state === "target-remove"  && "Will stop"}
          {state === "inactive"       && "Disabled"}
        </span>
        {node?.self && (
          <Badge variant="secondary" className="h-4 text-[9px] px-1.5 font-bold uppercase tracking-wider">
            You
          </Badge>
        )}
      </div>

      {/* Pulse animation for pending changes */}
      {isPending && (
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 pointer-events-none animate-pulse",
            state === "target-add"    && "bg-primary/[0.03]",
            state === "target-remove" && "bg-destructive/[0.03]",
          )}
        />
      )}
    </div>
  );
}

function HelperUnavailableBanner({ status }: { status: HelperStatus }) {
  // Server-side `reason` is a multi-line string ending with the exact
  // recovery command on its own indented line. Split there so the prose
  // and the copy-paste command render as separate visual blocks.
  const lines    = (status.reason ?? "The privileged helper is not installed.").split("\n");
  const cmdLine  = lines.find((l) => l.trim().startsWith("sudo "))?.trim();
  const proseLns = lines.filter((l) => !l.trim().startsWith("sudo "));

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-4">
      <div className="flex items-start gap-3">
        <div className="size-8 rounded-md bg-amber-500/15 ring-1 ring-amber-500/20 flex items-center justify-center shrink-0">
          <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="space-y-2 min-w-0 flex-1">
          <div>
            <p className="text-sm font-semibold tracking-tight text-amber-900 dark:text-amber-200">
              Live scaling is not available on this host
            </p>
            <p className="text-[12px] text-amber-800/80 dark:text-amber-300/80 mt-0.5 leading-relaxed whitespace-pre-line">
              {proseLns.join(" ").trim()}
            </p>
          </div>
          {cmdLine && (
            <div className="rounded-md bg-amber-950/[0.04] dark:bg-amber-200/[0.04] border border-amber-500/20 p-2.5">
              <p className="text-[10px] uppercase font-bold tracking-wider text-amber-700/70 dark:text-amber-400/70 mb-1">Run on the host (one-time)</p>
              <code className="block font-mono text-[11px] text-amber-900 dark:text-amber-200 break-all">
                {cmdLine}
              </code>
              <p className="mt-1.5 text-[10px] text-amber-800/70 dark:text-amber-300/70 leading-snug">
                This installs the NOPASSWD sudoers entry the helpdesk process needs to scale replicas.
                It's idempotent — safe to re-run.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfrastructureSkeleton() {
  return (
    <div className="max-w-4xl space-y-8 animate-pulse">
      <div className="space-y-2">
        <div className="h-5 w-40 rounded bg-muted" />
        <div className="h-3 w-96 rounded bg-muted/60" />
      </div>
      <div className="h-48 rounded-xl bg-muted/40" />
      <div className="grid lg:grid-cols-[1fr_320px] gap-5">
        <div className="h-40 rounded-xl bg-muted/40" />
        <div className="h-40 rounded-xl bg-muted/40" />
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function capacityBlurb(n: number): string {
  switch (n) {
    case 1: return "Single instance. Lowest DB pressure.";
    case 2: return "Active/standby capacity.";
    case 3: return "Recommended for most workloads.";
    case 4: return "Max throughput. Watch DB pool.";
    default: return "";
  }
}

/**
 * Read an NDJSON ReadableStream and invoke `onLine` for each parsed object.
 * Buffers partial lines across chunks. Skips malformed JSON silently.
 */
async function readNdjson(
  body: ReadableStream<Uint8Array>,
  onLine: (obj: Record<string, unknown>) => void,
): Promise<void> {
  const reader  = body.getReader();
  const decoder = new TextDecoder();
  let carry = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    carry += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = carry.indexOf("\n")) >= 0) {
      const line = carry.slice(0, nl).trim();
      carry = carry.slice(nl + 1);
      if (!line) continue;
      try { onLine(JSON.parse(line)); } catch { /* swallow malformed */ }
    }
  }
  if (carry.trim()) {
    try { onLine(JSON.parse(carry.trim())); } catch { /* swallow */ }
  }
}

/**
 * Render a helper event from the NDJSON stream into a human-readable
 * log line. Stays defensive — unknown event names get dumped as-is so
 * we never silently drop information from a future helper revision.
 */
function handleEvent(
  evt: Record<string, unknown>,
  push: (level: "info" | "warn" | "error", text: string) => void,
) {
  const name = String(evt.event ?? "");
  switch (name) {
    case "begin":
      push("info", `▸ begin → target=${evt.target} basePort=${evt.basePort}`);
      break;
    case "state":
      // Final state snapshot. Don't render — the React Query refetch will
      // refresh the UI. Useful for debugging if needed.
      break;
    case "plan": {
      const toEnable  = String(evt.toEnable  ?? "");
      const toDisable = String(evt.toDisable ?? "");
      push("info", `  plan → enable=[${toEnable}] disable=[${toDisable}]`);
      break;
    }
    case "enabling":  push("info", `  → enabling port ${evt.port}`); break;
    case "enabled":   push("info", `  ✓ enabled port ${evt.port}`); break;
    case "disabling": push("info", `  → disabling port ${evt.port}`); break;
    case "disabled":  push("info", `  ✓ disabled port ${evt.port}`); break;
    case "probing":   push("info", `  probing /api/health on ${evt.ports}…`); break;
    case "healthy":   push("info", `  ✓ healthy on port ${evt.port} (waited ${evt.waited}s)`); break;
    case "done":
      push("info", `✓ complete — final=${evt.final} healthy=${evt.healthy ?? "?"} changed=${evt.changed ?? 0}`);
      break;
    case "log": {
      // Pass-through line from the helper's stderr (systemctl chatter).
      push("info", `  · ${evt.line ?? ""}`);
      break;
    }
    case "error": {
      push("error", String(evt.message ?? "Unknown error"));
      break;
    }
    case "state_error":
      push("warn", `state refresh failed: ${evt.message}`);
      break;
    default:
      push("info", JSON.stringify(evt));
  }
}

// Re-export the inferred shape of an Axios error for any future call sites
// that want to narrow `error` from useQuery without re-importing axios.
export type ReplicaApiError = AxiosError;
