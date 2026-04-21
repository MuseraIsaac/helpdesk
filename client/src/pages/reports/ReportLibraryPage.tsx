/**
 * ReportLibraryPage — browse, open, and manage all analytics reports.
 *
 * Curated:  View (read-only), Clone to editable copy
 * Personal: Open/Edit, Manage Visibility, Clone, Delete
 */
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  BookMarked, Copy, Pencil, Trash2, Plus, Loader2, Lock,
  Eye, Globe, Users, Share2, Download, FileSpreadsheet, FileText,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import ErrorAlert from "@/components/ErrorAlert";
import VisibilityDialog from "@/components/reports/VisibilityDialog";
import { Calendar } from "lucide-react";
import { listReports, cloneReport, deleteReport } from "@/lib/reports/analytics-api";
import type { SavedReportMeta } from "@/lib/reports/analytics-api";
import { cn } from "@/lib/utils";

// ── Visibility badge ──────────────────────────────────────────────────────────

function VisibilityBadge({ report }: { report: SavedReportMeta }) {
  if (report.isCurated) {
    return (
      <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
        <Lock className="h-2.5 w-2.5" />Curated
      </Badge>
    );
  }
  if (report.visibility === "org") {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 shrink-0 border-violet-400/50 text-violet-600 dark:text-violet-400">
        <Globe className="h-2.5 w-2.5" />Org-wide
      </Badge>
    );
  }
  if (report.visibility === "team") {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 shrink-0 border-blue-400/50 text-blue-600 dark:text-blue-400">
        <Users className="h-2.5 w-2.5" />Team
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] gap-1 shrink-0 text-muted-foreground">
      <Lock className="h-2.5 w-2.5" />Private
    </Badge>
  );
}

// ── Tooltip-wrapped icon button ───────────────────────────────────────────────

function TipBtn({
  label, onClick, disabled, asLink, to, state, destructive, children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  asLink?: boolean;
  to?: string;
  state?: Record<string, unknown>;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  const cls = cn(
    "h-7 w-7",
    destructive && "text-destructive hover:text-destructive",
  );

  const btn = asLink && to ? (
    <Button variant="ghost" size="icon" className={cls} asChild>
      <Link to={to} state={state}>{children}</Link>
    </Button>
  ) : (
    <Button variant="ghost" size="icon" className={cls} onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Date params type ──────────────────────────────────────────────────────────

interface DateParams {
  period:     string;
  customFrom: string | undefined;
  customTo:   string | undefined;
}

// ── Per-report export helper ──────────────────────────────────────────────────

async function downloadReport(
  reportId:   number,
  reportName: string,
  format:     "csv" | "xlsx",
  date:       DateParams,
) {
  // Build the date portion of the request body so the server can override
  // the report's saved date range with the user's current selection.
  const dateBody: Record<string, string> =
    date.period === "custom" && date.customFrom && date.customTo
      ? { from: date.customFrom, to: date.customTo }
      : { period: date.period };

  const resp = await axios.post(
    `/api/analytics/reports/${reportId}/export`,
    { format, ...dateBody },
    { responseType: "blob" },
  );
  const ext  = format === "xlsx" ? "xlsx" : "csv";
  const mime = format === "xlsx"
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : "text/csv";
  const url = URL.createObjectURL(new Blob([resp.data as BlobPart], { type: mime }));
  const a   = document.createElement("a");
  a.href = url; a.download = `${reportName.replace(/\s+/g, "_")}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Report row ────────────────────────────────────────────────────────────────

function ReportRow({
  report, onClone, onDelete, onManageVisibility, isCloning, isDeleting, date,
}: {
  report: SavedReportMeta;
  onClone: (id: number) => void;
  onDelete: (id: number) => void;
  onManageVisibility: (report: SavedReportMeta) => void;
  isCloning: boolean;
  isDeleting: boolean;
  date: DateParams;
}) {
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);

  async function handleExport(format: "csv" | "xlsx") {
    setExporting(format);
    try {
      await downloadReport(report.id, report.name, format, date);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-3.5 border-b border-border/40 last:border-0",
      "hover:bg-muted/20 transition-colors group",
    )}>
      {/* Icon */}
      <div className={cn(
        "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
        report.isCurated
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground",
      )}>
        <BookMarked className="h-3.5 w-3.5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate max-w-xs">{report.name}</span>
          <VisibilityBadge report={report} />
        </div>
        {report.description && (
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1 leading-relaxed">
            {report.description}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
          {report.isCurated ? "System report" : `By ${report.owner?.name ?? "Unknown"}`}
          {" · "}
          {new Date(report.updatedAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
        </p>
      </div>

      {/* Actions — visible on hover */}
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">

        {/* Export dropdown — available for all reports */}
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!!exporting}>
                    {exporting
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Download className="h-3.5 w-3.5" />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem className="text-xs gap-2" onClick={() => handleExport("xlsx")} disabled={exporting === "xlsx"}>
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                    Export as Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs gap-2" onClick={() => handleExport("csv")} disabled={exporting === "csv"}>
                    <FileText className="h-3.5 w-3.5 text-blue-500" />
                    Export as CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TooltipTrigger>
            <TooltipContent>Export report data</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {report.isCurated ? (
          /* Curated: view (read-only) + clone */
          <>
            <TipBtn label="View (read-only)" asLink to={`/reports/custom/${report.id}`} state={{ curated: true }}>
              <Eye className="h-3.5 w-3.5" />
            </TipBtn>
            <TipBtn label="Clone to personal copy" onClick={() => onClone(report.id)} disabled={isCloning}>
              {isCloning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
            </TipBtn>
          </>
        ) : (
          /* Personal: open, visibility, clone, delete */
          <>
            <TipBtn label="Open / Edit" asLink to={`/reports/custom/${report.id}`}>
              <Pencil className="h-3.5 w-3.5" />
            </TipBtn>

            <TipBtn label="Manage visibility" onClick={() => onManageVisibility(report)}>
              <Share2 className="h-3.5 w-3.5" />
            </TipBtn>

            <TipBtn label="Clone" onClick={() => onClone(report.id)} disabled={isCloning}>
              {isCloning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
            </TipBtn>

            <AlertDialog>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        disabled={isDeleting}
                      >
                        {isDeleting
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </AlertDialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Delete</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete report?</AlertDialogTitle>
                  <AlertDialogDescription>
                    "{report.name}" will be permanently deleted. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => onDelete(report.id)}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  title, description, action, children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        {action}
      </div>
      <div className="bg-card rounded-xl border border-border/60 shadow-sm overflow-hidden">
        {children}
      </div>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportLibraryPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();

  // The date picker in ReportsLayout writes to search params.
  // We read them here so exports use the user's currently-selected date range.
  const period:     string           = searchParams.get("period")  ?? "30";
  const customFrom: string | undefined = searchParams.get("from")  ?? undefined;
  const customTo:   string | undefined = searchParams.get("to")    ?? undefined;
  const date: DateParams = { period, customFrom, customTo };

  const [cloningId,     setCloningId]     = useState<number | null>(null);
  const [deletingId,    setDeletingId]    = useState<number | null>(null);
  const [visibilityFor, setVisibilityFor] = useState<SavedReportMeta | null>(null);

  const { data: reports = [], isLoading, error } = useQuery({
    queryKey: ["analytics", "reports"],
    queryFn:  listReports,
    staleTime: 30_000,
  });

  const cloneMut = useMutation({
    mutationFn: (id: number) => cloneReport(id),
    onMutate:   id   => setCloningId(id),
    onSettled:  ()   => setCloningId(null),
    onSuccess:  (rep) => {
      qc.invalidateQueries({ queryKey: ["analytics", "reports"] });
      navigate(`/reports/custom/${rep.id}`);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteReport(id),
    onMutate:   id  => setDeletingId(id),
    onSettled:  ()  => setDeletingId(null),
    onSuccess:  ()  => qc.invalidateQueries({ queryKey: ["analytics", "reports"] }),
  });

  const curated  = reports.filter(r =>  r.isCurated);
  const personal = reports.filter(r => !r.isCurated);

  // ── Loading state ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl">
        {[...Array(2)].map((_, s) => (
          <div key={s} className="space-y-3">
            <div className="h-4 w-32 bg-muted rounded animate-pulse" />
            <div className="bg-card rounded-xl border border-border/60 overflow-hidden">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-border/40 last:border-0">
                  <div className="h-8 w-8 rounded-lg bg-muted animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-40 bg-muted rounded animate-pulse" />
                    <div className="h-2 w-64 bg-muted/60 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) return <ErrorAlert error={error} fallback="Failed to load reports" />;

  // Human-readable description of the currently-selected date range
  const dateRangeLabel =
    period === "custom" && customFrom && customTo
      ? `${new Date(customFrom).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })} – ${new Date(customTo).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}`
      : period === "30" ? "Last 30 days"
      : period === "7"  ? "Last 7 days"
      : period === "90" ? "Last 90 days"
      : `Last ${period} days`;

  return (
    <div className="space-y-6 max-w-3xl">

      {/* ── Date range export hint ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/15 text-xs text-muted-foreground">
        <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
        <span>
          Export data range: <strong className="text-foreground">{dateRangeLabel}</strong>
          {" — "}use the date picker above to change the range applied to all exports.
        </span>
      </div>

      {/* ── Curated reports ───────────────────────────────────────────────── */}
      <Section
        title="Curated Reports"
        description="System-managed reports. View read-only or clone to create your own editable copy."
      >
        {curated.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
            <BookMarked className="h-8 w-8 opacity-40" />
            <p className="text-sm">No curated reports yet</p>
          </div>
        ) : curated.map(r => (
          <ReportRow
            key={r.id}
            report={r}
            onClone={id => cloneMut.mutate(id)}
            onDelete={id => deleteMut.mutate(id)}
            onManageVisibility={setVisibilityFor}
            isCloning={cloningId === r.id}
            isDeleting={deletingId === r.id}
            date={date}
          />
        ))}
      </Section>

      {/* ── My reports ───────────────────────────────────────────────────── */}
      <Section
        title="My Reports"
        description="Reports you've built or cloned. Control who can access each one."
        action={
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs shrink-0" asChild>
            <Link to="/reports/custom">
              <Plus className="h-3.5 w-3.5" />
              New Report
            </Link>
          </Button>
        }
      >
        {personal.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <BookMarked className="h-8 w-8 opacity-40" />
            <p className="text-sm font-medium">No saved reports yet</p>
            <p className="text-xs">Clone a curated report above or build your own.</p>
            <Button size="sm" variant="outline" className="mt-2 text-xs" asChild>
              <Link to="/reports/custom">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New Custom Report
              </Link>
            </Button>
          </div>
        ) : personal.map(r => (
          <ReportRow
            key={r.id}
            report={r}
            onClone={id => cloneMut.mutate(id)}
            onDelete={id => deleteMut.mutate(id)}
            onManageVisibility={setVisibilityFor}
            isCloning={cloningId === r.id}
            isDeleting={deletingId === r.id}
            date={date}
          />
        ))}
      </Section>

      {(cloneMut.isError || deleteMut.isError) && (
        <ErrorAlert
          error={(cloneMut.error || deleteMut.error) as Error}
          fallback="Operation failed"
        />
      )}

      {/* ── Visibility dialog ─────────────────────────────────────────────── */}
      {visibilityFor && (
        <VisibilityDialog
          report={visibilityFor}
          open={!!visibilityFor}
          onOpenChange={open => { if (!open) setVisibilityFor(null); }}
        />
      )}
    </div>
  );
}
