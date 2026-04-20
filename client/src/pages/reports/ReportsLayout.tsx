import { Link, Outlet, useLocation, useSearchParams } from "react-router";
import {
  BarChart2, TrendingUp, ShieldCheck, AlertTriangle, Star,
  Users, UsersRound, BookOpen, Activity, Plus, Library,
  PackageCheck, Bug, CheckCircle2, GitBranch,
} from "lucide-react";
import DateRangePicker from "@/components/DateRangePicker";
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
  { section: "library",    label: "Library",         icon: Library,      color: "text-slate-500" },
] as const satisfies readonly { section: string; label: string; icon: React.ElementType; color: string }[];

const NO_DATE_SECTIONS = new Set(["/reports/realtime", "/reports/library"]);

// ── Layout ────────────────────────────────────────────────────────────────────

export default function ReportsLayout() {
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

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

  const activeNav = NAV_ITEMS.find(n => pathname === `/reports/${n.section}`);

  return (
    <div className="min-h-screen bg-muted/20">
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="bg-background border-b">
        <div className="px-6 pt-6 pb-0">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
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
      <div className="px-6 py-6">
        <Outlet />
      </div>
    </div>
  );
}
