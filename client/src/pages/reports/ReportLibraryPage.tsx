/**
 * ReportLibraryPage — lists all saved and curated analytics reports.
 *
 * Curated reports have a "Clone" button that creates a personal editable copy.
 * Personal reports have Edit and Delete actions.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookMarked, Copy, Pencil, Trash2, Plus, Loader2, Lock, ExternalLink,
} from "lucide-react";
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
import { listReports, cloneReport, deleteReport } from "@/lib/reports/analytics-api";
import type { SavedReportMeta } from "@/lib/reports/analytics-api";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function VisibilityBadge({ report }: { report: SavedReportMeta }) {
  if (report.isCurated) {
    return (
      <Badge variant="secondary" className="text-[10px] gap-1">
        <Lock className="h-2.5 w-2.5" />Curated
      </Badge>
    );
  }
  if (report.visibility === "org")  return <Badge variant="outline" className="text-[10px]">Org-wide</Badge>;
  if (report.visibility === "team") return <Badge variant="outline" className="text-[10px]">Team</Badge>;
  return <Badge variant="outline" className="text-[10px]">Private</Badge>;
}

// ── Action button with tooltip ────────────────────────────────────────────────

function ActionBtn({
  label, onClick, disabled, asLink, to, children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  asLink?: boolean;
  to?: string;
  children: React.ReactNode;
}) {
  const btn = asLink && to ? (
    <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
      <Link to={to}>{children}</Link>
    </Button>
  ) : (
    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClick} disabled={disabled}>
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

// ── Report row ────────────────────────────────────────────────────────────────

function ReportRow({
  report, onClone, onDelete, isCloning, isDeleting,
}: {
  report: SavedReportMeta;
  onClone: (id: number) => void;
  onDelete: (id: number) => void;
  isCloning: boolean;
  isDeleting: boolean;
}) {
  return (
    <div className={cn(
      "flex items-start gap-3 px-4 py-3.5 border-b border-border/50 last:border-0",
      "hover:bg-muted/30 transition-colors group",
    )}>
      <BookMarked className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{report.name}</span>
          <VisibilityBadge report={report} />
        </div>
        {report.description && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-1">
            {report.description}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground/70 mt-1">
          {report.isCurated ? "System report" : `By ${report.owner?.name ?? "Unknown"}`}
          {" · "}Updated {new Date(report.updatedAt).toLocaleDateString()}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {!report.isCurated && (
          <>
            <ActionBtn label="Open" asLink to={`/reports/custom/${report.id}`}>
              <ExternalLink className="h-3.5 w-3.5" />
            </ActionBtn>

            <ActionBtn label="Edit" asLink to={`/reports/custom/${report.id}`}>
              <Pencil className="h-3.5 w-3.5" />
            </ActionBtn>

            <AlertDialog>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
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

        <ActionBtn label="Clone to personal copy" onClick={() => onClone(report.id)} disabled={isCloning}>
          {isCloning
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Copy className="h-3.5 w-3.5" />}
        </ActionBtn>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportLibraryPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [cloningId,  setCloningId]  = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data: reports = [], isLoading, error } = useQuery({
    queryKey: ["analytics", "reports"],
    queryFn:  listReports,
    staleTime: 30_000,
  });

  const cloneMut = useMutation({
    mutationFn: (id: number) => cloneReport(id),
    onMutate:   (id)  => setCloningId(id),
    onSettled:  ()    => setCloningId(null),
    onSuccess:  (report) => {
      qc.invalidateQueries({ queryKey: ["analytics", "reports"] });
      navigate(`/reports/custom/${report.id}`);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteReport(id),
    onMutate:   (id)  => setDeletingId(id),
    onSettled:  ()    => setDeletingId(null),
    onSuccess:  ()    => qc.invalidateQueries({ queryKey: ["analytics", "reports"] }),
  });

  const curated  = reports.filter(r =>  r.isCurated);
  const personal = reports.filter(r => !r.isCurated);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 bg-muted/40 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) return <ErrorAlert error={error} fallback="Failed to load reports" />;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* ── Curated reports ───────────────────────────────────────────────── */}
      <section>
        <div className="mb-3">
          <h2 className="text-sm font-semibold">Curated Reports</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            System-managed reports. Clone to create an editable personal copy.
          </p>
        </div>
        <div className="border rounded-lg overflow-hidden">
          {curated.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No curated reports</p>
          ) : curated.map(r => (
            <ReportRow
              key={r.id}
              report={r}
              onClone={id => cloneMut.mutate(id)}
              onDelete={id => deleteMut.mutate(id)}
              isCloning={cloningId === r.id}
              isDeleting={deletingId === r.id}
            />
          ))}
        </div>
      </section>

      {/* ── Personal reports ──────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold">My Reports</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Reports you've built or cloned from curated templates.
            </p>
          </div>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" asChild>
            <Link to="/reports/custom">
              <Plus className="h-3.5 w-3.5" />
              New Report
            </Link>
          </Button>
        </div>
        <div className="border rounded-lg overflow-hidden">
          {personal.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <BookMarked className="h-8 w-8" />
              <p className="text-sm font-medium">No saved reports yet</p>
              <p className="text-xs">Clone a curated report or build your own with the custom report builder.</p>
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
              isCloning={cloningId === r.id}
              isDeleting={deletingId === r.id}
            />
          ))}
        </div>
      </section>

      {(cloneMut.isError || deleteMut.isError) && (
        <ErrorAlert
          error={(cloneMut.error || deleteMut.error) as Error}
          fallback="Operation failed"
        />
      )}
    </div>
  );
}
