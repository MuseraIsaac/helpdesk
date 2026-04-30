import { useState } from "react";
import { Link, Outlet, useLocation, useSearchParams } from "react-router";
import {
  BarChart2, TrendingUp, ShieldCheck, AlertTriangle, Star,
  Users, UsersRound, BookOpen, Activity, Plus, Library,
  PackageCheck, Bug, CheckCircle2, GitBranch,
  FileDown, Mail, ChevronDown, FileSpreadsheet, FileText, Loader2,
  Server, Network,
} from "lucide-react";
import axios from "axios";
import DateRangePicker from "@/components/DateRangePicker";
import { periodToRange } from "@/lib/reports/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ShareReportEmailDialog from "@/components/reports/ShareReportEmailDialog";
import { usePrintReport } from "@/hooks/usePrintReport";
import { cn } from "@/lib/utils";

// ── Navigation definition ─────────────────────────────────────────────────────

const NAV_ITEMS = [
  { section: "overview",   label: "Overview",       icon: BarChart2,    color: "text-blue-500" },
  { section: "tickets",    label: "Tickets",         icon: TrendingUp,   color: "text-violet-500" },
  { section: "sla",        label: "SLA",             icon: ShieldCheck,  color: "text-emerald-500" },
  { section: "agents",     label: "Agents",          icon: Users,        color: "text-sky-500" },
  { section: "teams",      label: "Teams",           icon: UsersRound,   color: "text-indigo-500" },
  { section: "incidents",  label: "Incidents",       icon: AlertTriangle,color: "text-rose-500" },
  { section: "requests",   label: "Requests",        icon: PackageCheck, color: "text-teal-500" },
  { section: "problems",   label: "Problems",        icon: Bug,          color: "text-orange-500" },
  { section: "approvals",  label: "Approvals",       icon: CheckCircle2, color: "text-green-500" },
  { section: "changes",    label: "Changes",         icon: GitBranch,    color: "text-purple-500" },
  { section: "csat",       label: "CSAT",            icon: Star,         color: "text-amber-500" },
  { section: "kb",         label: "Knowledge Base",  icon: BookOpen,     color: "text-cyan-500" },
  { section: "realtime",   label: "Real-time",       icon: Activity,     color: "text-red-500" },
  { section: "assets",     label: "Assets",           icon: Server,       color: "text-blue-500" },
  { section: "insights",   label: "Insights",         icon: Network,      color: "text-fuchsia-500" },
  { section: "library",    label: "Library",          icon: Library,      color: "text-slate-500" },
] as const satisfies readonly { section: string; label: string; icon: React.ElementType; color: string }[];

// Realtime is a live snapshot — date range has no meaning there.
// Library shows the date picker so the user can set a date range for exports.
const NO_DATE_SECTIONS = new Set(["/reports/realtime"]);

// ── Layout ────────────────────────────────────────────────────────────────────

export default function ReportsLayout() {
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [shareOpen,    setShareOpen]    = useState(false);
  const [exporting,    setExporting]    = useState<"csv" | "xlsx" | null>(null);
  const printReport = usePrintReport();

  const period     = searchParams.get("period")  ?? "30";
  const customFrom = searchParams.get("from")    ?? undefined;
  const customTo   = searchParams.get("to")      ?? undefined;

  function handlePeriod(next: string) {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      p.set("period", next);
      if (next !== "custom") { p.delete("from"); p.delete("to"); }
      return p;
    });
  }

  function handleCustom(range: { from: string; to: string }) {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      p.set("period", "custom");
      p.set("from", range.from);
      p.set("to",   range.to);
      return p;
    });
  }

  const showDatePicker = !NO_DATE_SECTIONS.has(pathname);

  const periodQs = period === "custom" && customFrom && customTo
    ? `period=custom&from=${customFrom}&to=${customTo}`
    : `period=${period}`;

  const activeNav     = NAV_ITEMS.find(n => pathname === `/reports/${n.section}`);
  const activeSection = activeNav?.section ?? "overview";

  function buildPeriodLabel() {
    if (period === "custom" && customFrom && customTo) {
      const fmt = (d: string) =>
        new Date(d).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
      return `${fmt(customFrom)} – ${fmt(customTo)}`;
    }
    const map: Record<string, string> = {
      today:        "Today",
      yesterday:    "Yesterday",
      "7":          "Last 7 days",
      "30":         "Last 30 days",
      "90":         "Last 90 days",
      this_month:   "This month",
      last_month:   "Last month",
    };
    return map[period] ?? `Last ${period} days`;
  }

  /** Collect active dimension filters from the current URL search params */
  function buildActiveFilters() {
    const f: Record<string, string | number> = {};
    const priority   = searchParams.get("priority");
    const category   = searchParams.get("category");
    const teamId     = searchParams.get("teamId");
    const assigneeId = searchParams.get("assigneeId");
    const status     = searchParams.get("status");
    if (priority)   f.priority   = priority;
    if (category)   f.category   = category;
    if (teamId)     f.teamId     = Number(teamId);
    if (assigneeId) f.assigneeId = assigneeId;
    if (status)     f.status     = status;
    return Object.keys(f).length > 0 ? f : undefined;
  }

  async function handleExport(format: "csv" | "xlsx") {
    setExporting(format);
    try {
      // The export endpoint only understands numeric periods natively. For
      // named presets (today / yesterday / this_month / last_month) resolve
      // to a concrete from/to range on the client so the server receives
      // dates instead of falling back to its default 30-day window.
      const isNumeric = /^\d+$/.test(period);
      let exportFrom = customFrom;
      let exportTo   = customTo;
      if (!isNumeric && period !== "custom") {
        const range = periodToRange(period, customFrom, customTo);
        exportFrom = range.from;
        exportTo   = range.to;
      }

      const resp = await axios.post(
        "/api/reports/export",
        {
          section: activeSection,
          period:  isNumeric ? period : undefined,
          from:    exportFrom,
          to:      exportTo,
          format,
          filters: buildActiveFilters(),
        },
        { responseType: "blob" },
      );
      const ext  = format === "xlsx" ? "xlsx" : "csv";
      const mime = format === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv";
      const url  = URL.createObjectURL(new Blob([resp.data as BlobPart], { type: mime }));
      const a    = document.createElement("a");
      const sectionLabel = activeNav?.label ?? "Report";
      a.href     = url;
      const fileSuffix =
        period === "custom" && customFrom ? `${customFrom}_to_${customTo}` :
        period === "today"      ? "Today" :
        period === "yesterday"  ? "Yesterday" :
        period === "this_month" ? "This_Month" :
        period === "last_month" ? "Last_Month" :
        `Last_${period}_days`;
      a.download = `${sectionLabel}_Report_${fileSuffix}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="min-h-screen bg-muted/20">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="bg-background border-b" data-no-print>
        <div className="px-6 pt-6 pb-0">

          <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
            {/* Left: icon + title */}
            <div className="flex items-center gap-3">
              {activeNav && (
                <div className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                  "bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10",
                )}>
                  <activeNav.icon className={cn("h-5 w-5", activeNav.color)} />
                </div>
              )}
              <div>
                <h1 className="text-xl font-bold tracking-tight">
                  {activeNav ? activeNav.label : "Reports"}
                  <span className="text-muted-foreground font-normal text-base ml-2">analytics</span>
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Performance insights across all service channels
                </p>
              </div>
            </div>

            {/* Right: date picker + actions (always visible on every tab) */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {showDatePicker && (
                <DateRangePicker
                  period={period}
                  customFrom={customFrom}
                  customTo={customTo}
                  onPeriod={handlePeriod}
                  onCustom={handleCustom}
                />
              )}

              {/* Export dropdown — every tab */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-3 gap-1.5 text-xs"
                    disabled={!!exporting}
                  >
                    {exporting
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <FileDown className="h-3.5 w-3.5" />}
                    Export
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    className="text-xs gap-2"
                    onClick={() => handleExport("xlsx")}
                    disabled={exporting === "xlsx"}
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                    Export as Excel (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-xs gap-2"
                    onClick={() => handleExport("csv")}
                    disabled={exporting === "csv"}
                  >
                    <FileText className="h-3.5 w-3.5 text-blue-500" />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-xs gap-2"
                    onClick={() => printReport({
                      title: `${activeNav?.label ?? "Report"} Report`,
                      periodLabel: buildPeriodLabel(),
                    })}
                  >
                    <FileDown className="h-3.5 w-3.5 text-muted-foreground" />
                    Save as PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Share via Email — every tab */}
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-3 gap-1.5 text-xs"
                      onClick={() => setShareOpen(true)}
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Share
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Share report via email</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <Link
                to="/reports/custom"
                className={cn(
                  "inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold rounded-lg",
                  "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors whitespace-nowrap",
                )}
              >
                <Plus className="h-3.5 w-3.5" />
                New Report
              </Link>
            </div>
          </div>

          {/* ── Scrollable tab nav ──────────────────────────────────────── */}
          <nav className="flex gap-0 overflow-x-auto -mb-px scrollbar-none" aria-label="Report sections">
            {NAV_ITEMS.map(({ section, label, icon: Icon, color }) => {
              const isActive = pathname === `/reports/${section}`;
              return (
                <Link
                  key={section}
                  to={`/reports/${section}?${periodQs}`}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium whitespace-nowrap",
                    "border-b-2 transition-all duration-150",
                    isActive
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5 shrink-0", isActive ? color : "")} />
                  {label}
                </Link>
              );
            })}
          </nav>

        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div id="report-print-area" className="px-6 py-6">
        <Outlet />
      </div>

      {/* ── Share via email dialog ─────────────────────────────────────────── */}
      <ShareReportEmailDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        section={activeSection}
        period={period}
        customFrom={customFrom}
        customTo={customTo}
      />

    </div>
  );
}
