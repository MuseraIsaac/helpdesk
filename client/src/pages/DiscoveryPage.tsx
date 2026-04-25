import { useRef, useState } from "react";
import { Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  CONNECTOR_SOURCE_LABEL, CONNECTOR_SOURCE_DESCRIPTION, CONNECTOR_REQUIRED_ENV,
  SYNC_RUN_STATUS_LABEL, SYNC_RUN_STATUS_COLOR, SYNC_TRIGGER_LABEL,
  SYNC_POLICY_LABEL,
  type ConnectorSummary, type SyncRunSummary,
} from "core/constants/discovery.ts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createConnectorSchema, type CreateConnectorInput } from "core/schemas/discovery.ts";
import ErrorAlert from "@/components/ErrorAlert";
import {
  Radar, Plus, Upload, Play, RefreshCw, CheckCircle2, XCircle, Clock,
  ChevronRight, AlertTriangle, Loader2, FileUp, Info, Download,
} from "lucide-react";
import { toast } from "sonner";

// ── Stat badge helpers ────────────────────────────────────────────────────────

function RunCountBadge({ value, label, color }: { value: number; label: string; color: string }) {
  if (!value) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${color}`}>
      {value} {label}
    </span>
  );
}

// ── CSV Upload dialog ─────────────────────────────────────────────────────────

function CsvUploadDialog({ onImported }: { onImported: () => void }) {
  const [open, setOpen]         = useState(false);
  const [file, setFile]         = useState<File | null>(null);
  const [syncPolicy, setSyncPolicy] = useState<"merge" | "overwrite">("merge");
  const [validating, setValidating] = useState(false);
  const [preview, setPreview]   = useState<{
    rowCount: number; validRows: number; missingIdRows: number; missingNameRows: number;
    headers: string[]; sampleErrors: string[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  function isExcelFile(f: File) {
    return f.name.toLowerCase().endsWith(".xlsx") || f.name.toLowerCase().endsWith(".xls") ||
      f.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      f.type === "application/vnd.ms-excel";
  }

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      if (isExcelFile(file)) {
        const buf = await file.arrayBuffer();
        return axios.post("/api/discovery/import/csv", buf, {
          headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
          params:  { syncPolicy },
        }).then(r => r.data);
      }
      const text = await file.text();
      return axios.post("/api/discovery/import/csv", text, {
        headers: { "Content-Type": "text/plain" },
        params:  { syncPolicy },
      }).then(r => r.data);
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["discovery"] });
      toast.success(`Import complete: ${result.assetsCreated} created, ${result.assetsUpdated} updated`);
      setOpen(false);
      setFile(null);
      setPreview(null);
      onImported();
    },
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(null);
    setValidating(true);
    try {
      let body: string | ArrayBuffer;
      let contentType: string;
      if (isExcelFile(f)) {
        body = await f.arrayBuffer();
        contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      } else {
        body = await f.text();
        contentType = "text/plain";
      }
      const r = await axios.post("/api/discovery/import/csv/validate", body, {
        headers: { "Content-Type": contentType },
      });
      setPreview(r.data);
    } catch {
      // validation error — import will still work, just show what we can
    } finally {
      setValidating(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="outline" size="sm">
        <Upload className="w-4 h-4 mr-1.5" />Import Assets
      </Button>
      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setFile(null); setPreview(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Assets from CSV or Excel</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Upload a CSV or Excel-compatible file. Required columns:{" "}
                  <code className="text-xs bg-muted px-1 rounded">name</code> and{" "}
                  <code className="text-xs bg-muted px-1 rounded">externalId</code>{" "}
                  (aliases: <code className="text-xs bg-muted px-1 rounded">external_id</code>,{" "}
                  <code className="text-xs bg-muted px-1 rounded">id</code>).
                </p>
                <a href="/api/discovery/import/csv/template" download>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5 h-7 text-xs">
                    <Download className="w-3.5 h-3.5" />
                    Download Excel Template
                  </Button>
                </a>
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <FileUp className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
              {file ? (
                <div>
                  <p className="font-medium text-sm">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Click to select a CSV or Excel (.xlsx) file</p>
              )}
              <input
                ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {validating && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />Validating…
              </div>
            )}

            {preview && (
              <div className="rounded-lg border bg-muted/20 p-3 text-sm space-y-1">
                <p className="font-medium">Preview</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                  <span>Total rows</span>   <span className="font-medium text-foreground">{preview.rowCount}</span>
                  <span>Valid rows</span>   <span className="font-medium text-emerald-600">{preview.validRows}</span>
                  {preview.missingIdRows > 0 && (
                    <><span>Missing externalId</span><span className="text-amber-600 font-medium">{preview.missingIdRows}</span></>
                  )}
                  {preview.missingNameRows > 0 && (
                    <><span>Missing name</span><span className="text-amber-600 font-medium">{preview.missingNameRows}</span></>
                  )}
                </div>
                {preview.sampleErrors.length > 0 && (
                  <div className="mt-2 text-xs text-destructive space-y-0.5">
                    {preview.sampleErrors.map((e, i) => <p key={i}>{e}</p>)}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-1.5 block">Sync Policy</label>
              <Select value={syncPolicy} onValueChange={v => setSyncPolicy(v as "merge" | "overwrite")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merge">
                    <div>
                      <p className="font-medium">Merge</p>
                      <p className="text-xs text-muted-foreground">Preserve operator-set fields (owner, team, procurement)</p>
                    </div>
                  </SelectItem>
                  <SelectItem value="overwrite">
                    <div>
                      <p className="font-medium">Overwrite</p>
                      <p className="text-xs text-muted-foreground">CSV is authoritative — overwrites all mapped fields</p>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <ErrorAlert error={importMutation.error} fallback="Import failed" />

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={!file || importMutation.isPending}
              onClick={() => importMutation.mutate()}
            >
              {importMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Importing…</>
              ) : (
                <><Upload className="w-4 h-4 mr-1.5" />Import</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Register connector dialog ─────────────────────────────────────────────────

function NewConnectorDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const form = useForm<CreateConnectorInput>({
    resolver: zodResolver(createConnectorSchema),
    defaultValues: { isEnabled: true, syncPolicy: "merge", config: {} },
  });
  const source = form.watch("source");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: CreateConnectorInput) =>
      axios.post("/api/discovery/connectors", data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discovery"] });
      setOpen(false);
      form.reset();
      onCreated();
    },
  });

  const requiredEnv = source ? CONNECTOR_REQUIRED_ENV[source] ?? [] : [];

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4 mr-1.5" />Add Connector
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Register Discovery Connector</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
              <FormField control={form.control} name="source" render={({ field }) => (
                <FormItem>
                  <FormLabel>Source Type *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ""}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select source…" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {(["csv", "jamf", "intune", "sccm", "snmp", "custom"] as const).map(s => (
                        <SelectItem key={s} value={s}>
                          <div>
                            <p className="font-medium">{CONNECTOR_SOURCE_LABEL[s]}</p>
                            <p className="text-xs text-muted-foreground">{CONNECTOR_SOURCE_DESCRIPTION[s]}</p>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              {requiredEnv.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm">
                  <p className="font-medium text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />Required environment variables
                  </p>
                  <p className="text-amber-700 dark:text-amber-400 mt-1 text-xs">
                    Set these on your server. Never enter credentials here.
                  </p>
                  <ul className="mt-1.5 space-y-0.5">
                    {requiredEnv.map(v => (
                      <li key={v}><code className="text-xs bg-amber-100 dark:bg-amber-900/40 px-1 rounded">{v}</code></li>
                    ))}
                  </ul>
                </div>
              )}

              <FormField control={form.control} name="label" render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Name *</FormLabel>
                  <FormControl><Input placeholder="e.g. Jamf Pro (EMEA)" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="syncPolicy" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sync Policy</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="merge">Merge</SelectItem>
                        <SelectItem value="overwrite">Overwrite</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="scheduleExpression" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Schedule (cron)</FormLabel>
                    <FormControl><Input placeholder="0 2 * * * (daily at 2am)" {...field} value={field.value ?? ""} /></FormControl>
                    <FormDescription className="text-xs">Leave blank for manual only.</FormDescription>
                  </FormItem>
                )} />
              </div>

              <ErrorAlert error={mutation.error} fallback="Failed to register connector" />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? "Registering…" : "Register"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Connector card ────────────────────────────────────────────────────────────

function ConnectorCard({ connector, onSync }: { connector: ConnectorSummary; onSync: (id: number) => void }) {
  const run = connector.recentRun;
  const qc  = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      axios.patch(`/api/discovery/connectors/${connector.id}`, { isEnabled: enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discovery"] }),
  });

  const isRunning = run?.status === "running" || run?.status === "pending";

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-2 h-2 rounded-full shrink-0 ${connector.isEnabled ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{connector.label}</p>
            <p className="text-xs text-muted-foreground">{CONNECTOR_SOURCE_LABEL[connector.source as keyof typeof CONNECTOR_SOURCE_LABEL] ?? connector.source}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Switch
            checked={connector.isEnabled}
            onCheckedChange={v => toggleMutation.mutate(v)}
            disabled={toggleMutation.isPending}
          />
          {connector.source !== "csv" && (
            <Button
              size="sm" variant="outline"
              disabled={!connector.isEnabled || isRunning}
              onClick={() => onSync(connector.id)}
            >
              {isRunning
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Play className="w-3.5 h-3.5" />
              }
            </Button>
          )}
        </div>
      </div>

      {/* Last run */}
      {run ? (
        <div className="rounded-md bg-muted/40 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className={`text-xs px-2 py-0.5 rounded-full border ${SYNC_RUN_STATUS_COLOR[run.status]}`}>
              {SYNC_RUN_STATUS_LABEL[run.status]}
            </span>
            <span className="text-xs text-muted-foreground">
              {run.completedAt ? new Date(run.completedAt).toLocaleString() : run.startedAt ? "Running…" : "Queued"}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <RunCountBadge value={run.assetsCreated} label="created" color="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" />
            <RunCountBadge value={run.assetsUpdated} label="updated" color="bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" />
            <RunCountBadge value={run.assetsFailed}  label="failed"  color="bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300" />
            <RunCountBadge value={run.assetsStale}   label="stale"   color="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" />
          </div>
          {run.errorMessage && (
            <p className="text-xs text-destructive truncate">{run.errorMessage}</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No syncs run yet.</p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{connector.totalSynced.toLocaleString()} total imported</span>
        <Link to={`/discovery/${connector.id}`} className="hover:text-foreground flex items-center gap-0.5">
          Details <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

// ── Recent runs table ─────────────────────────────────────────────────────────

function RecentRunsTable({ runs, isLoading }: { runs?: SyncRunSummary[]; isLoading: boolean }) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b font-medium text-sm">Recent Sync Runs</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            {["Source", "Trigger", "Status", "Created", "Updated", "Failed", "Stale", "Duration", "Time"].map(h => (
              <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading && Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-b animate-pulse">
              {Array.from({ length: 9 }).map((_, j) => (
                <td key={j} className="px-3 py-2.5"><div className="h-3.5 bg-muted rounded w-16" /></td>
              ))}
            </tr>
          ))}
          {runs?.map(run => (
            <tr key={run.id} className="border-b hover:bg-muted/30 transition-colors">
              <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{run.source}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{SYNC_TRIGGER_LABEL[run.triggerType]}</td>
              <td className="px-3 py-2.5">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${SYNC_RUN_STATUS_COLOR[run.status]}`}>
                  {SYNC_RUN_STATUS_LABEL[run.status]}
                </span>
              </td>
              <td className="px-3 py-2.5 text-emerald-600 tabular-nums">{run.assetsCreated || "—"}</td>
              <td className="px-3 py-2.5 text-sky-600 tabular-nums">{run.assetsUpdated || "—"}</td>
              <td className="px-3 py-2.5 text-destructive tabular-nums">{run.assetsFailed || "—"}</td>
              <td className="px-3 py-2.5 text-amber-600 tabular-nums">{run.assetsStale || "—"}</td>
              <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                {run.durationMs !== null ? `${(run.durationMs / 1000).toFixed(1)}s` : "—"}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                <Link to={`/discovery/runs/${run.id}`} className="hover:underline">
                  {new Date(run.createdAt).toLocaleString()}
                </Link>
              </td>
            </tr>
          ))}
          {!isLoading && runs?.length === 0 && (
            <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No sync runs yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DiscoveryPage() {
  const qc = useQueryClient();

  const { data: connectors = [], isLoading: connectorsLoading } = useQuery<ConnectorSummary[]>({
    queryKey: ["discovery", "connectors"],
    queryFn: () => axios.get("/api/discovery/connectors").then(r => r.data),
    refetchInterval: 10_000, // poll while syncs might be running
  });

  const { data: runsData, isLoading: runsLoading } = useQuery<{ items: SyncRunSummary[] }>({
    queryKey: ["discovery", "runs"],
    queryFn: () => axios.get("/api/discovery/runs", { params: { pageSize: 20 } }).then(r => r.data),
    refetchInterval: 10_000,
  });

  const triggerSyncMutation = useMutation({
    mutationFn: (connectorId: number) =>
      axios.post(`/api/discovery/connectors/${connectorId}/sync`).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["discovery"] });
      toast.success(`Sync queued (run #${data.syncRunId})`);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error ?? "Failed to trigger sync");
    },
  });

  const activeRuns = runsData?.items.filter(r => r.status === "running" || r.status === "pending").length ?? 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Radar className="w-6 h-6 text-indigo-500" />
            Discovery & Sync
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Import assets from external sources. CSV imports are immediate; connector syncs are queued.
          </p>
        </div>
        <div className="flex gap-2">
          <CsvUploadDialog onImported={() => qc.invalidateQueries({ queryKey: ["discovery"] })} />
          <NewConnectorDialog onCreated={() => qc.invalidateQueries({ queryKey: ["discovery"] })} />
        </div>
      </div>

      {activeRuns > 0 && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 dark:bg-sky-900/20 p-3 flex items-center gap-2 text-sm text-sky-800 dark:text-sky-300">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          {activeRuns} sync job{activeRuns !== 1 ? "s" : ""} running…
        </div>
      )}

      {/* CSV help banner */}
      {connectors.length === 0 && !connectorsLoading && (
        <div className="rounded-lg border bg-muted/30 p-4 flex gap-3">
          <Info className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">Getting started with Discovery</p>
            <p className="text-muted-foreground mt-1">
              Use <strong>CSV Import</strong> to load assets immediately — no connector setup needed.
              For automated syncs from Jamf Pro, Intune, or SCCM, register a connector and set the required
              environment variables on your server.
            </p>
            <p className="text-muted-foreground mt-1">
              CSV required columns: <code className="text-xs bg-muted px-1 rounded">name</code>{" "}
              <code className="text-xs bg-muted px-1 rounded">externalId</code>
            </p>
          </div>
        </div>
      )}

      {/* Connector grid */}
      {(connectorsLoading || connectors.length > 0) && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Connectors</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {connectorsLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-lg border bg-card p-4 space-y-3 animate-pulse">
                    <div className="h-4 bg-muted rounded w-32" />
                    <div className="h-16 bg-muted rounded" />
                    <div className="h-3 bg-muted rounded w-24" />
                  </div>
                ))
              : connectors.map(c => (
                  <ConnectorCard
                    key={c.id}
                    connector={c}
                    onSync={id => triggerSyncMutation.mutate(id)}
                  />
                ))
            }
          </div>
        </div>
      )}

      {/* Recent runs */}
      <RecentRunsTable runs={runsData?.items} isLoading={runsLoading} />
    </div>
  );
}
