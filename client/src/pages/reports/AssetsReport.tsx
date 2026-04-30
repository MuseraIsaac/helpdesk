import { useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import ErrorAlert from "@/components/ErrorAlert";
import KpiCard from "@/components/reports/KpiCard";
import ChartCard from "@/components/reports/ChartCard";
import ReportLoading from "@/components/reports/ReportLoading";
import { fetchAssetReport } from "@/lib/reports/api";
import { fmtDay, xInterval } from "@/lib/reports/utils";
import {
  Server, AlertTriangle, Clock, BarChart2, MapPin,
  Users, Radar, Activity, ShieldAlert, ArrowUpRight,
  Package, Cpu, Wifi, Smartphone, Monitor, Cloud,
} from "lucide-react";

// ── Label maps ────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  ordered:           "Ordered",
  in_stock:          "In Stock",
  deployed:          "Deployed",
  in_use:            "In Use",
  under_maintenance: "Maintenance",
  in_repair:         "In Repair",
  retired:           "Retired",
  disposed:          "Disposed",
  lost_stolen:       "Lost / Stolen",
};

const TYPE_LABEL: Record<string, string> = {
  hardware:          "Hardware",
  end_user_device:   "End-User Device",
  software_license:  "Software License",
  network_equipment: "Network Equipment",
  peripheral:        "Peripheral",
  mobile_device:     "Mobile",
  cloud_resource:    "Cloud Resource",
  iot_device:        "IoT Device",
  audio_visual:      "A/V Equipment",
  vehicle:           "Vehicle",
  furniture:         "Furniture",
  consumable:        "Consumable",
  other:             "Other",
};

// Status → tailwind accent color (for the stacked distribution)
const STATUS_COLOR: Record<string, string> = {
  ordered:           "#94a3b8",
  in_stock:          "#38bdf8",
  deployed:          "#10b981",
  in_use:            "#3b82f6",
  under_maintenance: "#f59e0b",
  in_repair:         "#f97316",
  retired:           "#a1a1aa",
  disposed:          "#71717a",
  lost_stolen:       "#ef4444",
};

// Type → icon (lightweight)
function TypeIcon({ type }: { type: string }) {
  const cls = "h-3 w-3";
  switch (type) {
    case "hardware":          return <Monitor className={cls} />;
    case "end_user_device":   return <Cpu className={cls} />;
    case "network_equipment": return <Wifi className={cls} />;
    case "mobile_device":     return <Smartphone className={cls} />;
    case "cloud_resource":    return <Cloud className={cls} />;
    default:                  return <Package className={cls} />;
  }
}

// ── Drill-down link helper ────────────────────────────────────────────────────

function DrillLink({
  label,
  to,
  count,
  variant = "default",
}: {
  label: string;
  to: string;
  count: number;
  variant?: "default" | "warning" | "danger";
}) {
  const navigate = useNavigate();
  const color =
    variant === "danger"  ? "text-destructive hover:text-destructive/80" :
    variant === "warning" ? "text-amber-600 hover:text-amber-500" :
    "text-muted-foreground hover:text-foreground";

  return (
    <button
      onClick={() => navigate(to)}
      className={`flex items-center gap-1 text-xs ${color} transition-colors group`}
    >
      <span className="tabular-nums font-semibold">{count.toLocaleString()}</span>
      <span>{label}</span>
      <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

// ── Alert tile (expiry / retirement cards) ────────────────────────────────────

function AlertTile({
  label,
  count,
  sub,
  variant,
  to,
  icon: Icon,
}: {
  label:   string;
  count:   number;
  sub:     string;
  variant: "warning" | "danger" | "success";
  to:      string;
  icon:    React.ComponentType<{ className?: string }>;
}) {
  const navigate = useNavigate();
  const styles = {
    warning: {
      border: "border-amber-500/30",
      bg:     "bg-amber-500/5 dark:bg-amber-500/10",
      icon:   "text-amber-500",
      badge:  "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
      accent: "bg-amber-500",
    },
    danger: {
      border: "border-rose-500/30",
      bg:     "bg-rose-500/5 dark:bg-rose-500/10",
      icon:   "text-rose-500",
      badge:  "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
      accent: "bg-rose-500",
    },
    success: {
      border: "border-emerald-500/30",
      bg:     "bg-emerald-500/5 dark:bg-emerald-500/10",
      icon:   "text-emerald-500",
      badge:  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
      accent: "bg-emerald-500",
    },
  };
  const s = styles[variant];

  return (
    <button
      onClick={() => count > 0 && navigate(to)}
      disabled={count === 0}
      className={`
        relative flex items-stretch rounded-xl border overflow-hidden shadow-sm
        transition-all hover:shadow-md text-left w-full
        ${s.border} ${s.bg} ${count === 0 ? "opacity-60 cursor-default" : "cursor-pointer"}
      `}
    >
      <div className={`w-1 shrink-0 ${s.accent}`} />
      <div className="flex-1 px-4 py-3.5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {label}
          </p>
          <Icon className={`h-4 w-4 ${s.icon}`} />
        </div>
        <p className="text-2xl font-bold tabular-nums tracking-tight">{count.toLocaleString()}</p>
        <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>
      </div>
    </button>
  );
}

// ── Custom tooltip for donut / breakdown ──────────────────────────────────────

function PctTooltip({ active, payload, total }: any) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
  return (
    <div className="bg-popover border rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-medium">{name}</p>
      <p className="text-muted-foreground">{value.toLocaleString()} ({pct}%)</p>
    </div>
  );
}

// ── Main report ───────────────────────────────────────────────────────────────

export default function AssetsReport() {
  const [searchParams] = useSearchParams();
  const period    = searchParams.get("period") ?? "30";
  const customFrom = searchParams.get("from") ?? undefined;
  const customTo   = searchParams.get("to")   ?? undefined;

  const periodQs = period === "custom" && customFrom && customTo
    ? `period=custom&from=${customFrom}&to=${customTo}`
    : `period=${period}`;

  const { data, isLoading, error } = useQuery({
    queryKey: ["reports", "assets", periodQs],
    queryFn:  () => fetchAssetReport(periodQs),
  });

  if (isLoading) return <ReportLoading kpiCount={6} chartCount={4} />;
  if (error)     return <ErrorAlert error={error as Error} fallback="Failed to load asset analytics" />;
  if (!data)     return null;

  const utilizationPct = data.totalAssets > 0
    ? Math.round((data.activeAssets / data.totalAssets) * 100)
    : 0;

  // ── Derived chart data ──────────────────────────────────────────────────────

  const statusChartData = data.byStatus.map(s => ({
    status: STATUS_LABEL[s.status] ?? s.status,
    count:  s.count,
    fill:   STATUS_COLOR[s.status] ?? "#94a3b8",
  }));

  const typeChartData = data.byType
    .slice(0, 10)
    .map(t => ({ type: TYPE_LABEL[t.type] ?? t.type, count: t.count }));

  const teamChartData = data.byTeam
    .slice(0, 12)
    .map(t => ({ name: t.teamName, count: t.count, active: t.active }));

  const locationChartData = data.byLocation
    .slice(0, 12)
    .map(l => ({ location: l.location, count: l.count }));

  return (
    <div className="space-y-6">

      {/* ── Row 1: Core KPIs ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          title="Total Assets"
          value={data.totalAssets.toLocaleString()}
          icon={<Server />}
          variant="default"
        />
        <KpiCard
          title="Active"
          value={data.activeAssets.toLocaleString()}
          sub={`${utilizationPct}% utilization`}
          icon={<Activity />}
          variant="success"
        />
        <KpiCard
          title="In Stock"
          value={data.inStockAssets.toLocaleString()}
          sub="ready to deploy"
          icon={<Package />}
          variant="info"
        />
        <KpiCard
          title="In Maintenance"
          value={data.maintenanceAssets.toLocaleString()}
          sub="under repair"
          icon={<Clock />}
          variant={data.maintenanceAssets > 0 ? "warning" : "default"}
        />
        <KpiCard
          title="Discovery Managed"
          value={data.managedByDiscovery.toLocaleString()}
          sub={`${data.staleAssets} stale`}
          icon={<Radar />}
          variant={data.staleAssets > 0 ? "warning" : "default"}
        />
        <KpiCard
          title="Incident Exposure"
          value={data.assetsWithOpenIncidents.toLocaleString()}
          sub={`${data.openIncidentCount} open incidents`}
          icon={<ShieldAlert />}
          variant={data.assetsWithOpenIncidents > 0 ? "danger" : "default"}
        />
      </div>

      {/* ── Row 2: Expiry & Retirement Alerts ───────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold">Expiry & Retirement Alerts</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <AlertTile
            label="Warranty <30d"
            count={data.warrantyExpiring30}
            sub="critical — expiring this month"
            variant="danger"
            to={`/assets?warrantyExpiringSoon=true`}
            icon={AlertTriangle}
          />
          <AlertTile
            label="Warranty <90d"
            count={data.warrantyExpiring90}
            sub="plan renewals now"
            variant="warning"
            to={`/assets?warrantyExpiringSoon=true`}
            icon={Clock}
          />
          <AlertTile
            label="Contracts <30d"
            count={data.contractsExpiring30}
            sub="vendor agreements"
            variant="danger"
            to={`/contracts`}
            icon={AlertTriangle}
          />
          <AlertTile
            label="Retirement Due <90d"
            count={data.retirementDue90}
            sub="end-of-life approaching"
            variant="warning"
            to={`/assets`}
            icon={Clock}
          />
          <AlertTile
            label="Retirement Overdue"
            count={data.retirementOverdue}
            sub="past EoL, still active"
            variant="danger"
            to={`/assets`}
            icon={AlertTriangle}
          />
        </div>
      </div>

      {/* ── Row 3: Lifecycle State + Asset Class ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Lifecycle state — horizontal bars with status colors */}
        <ChartCard
          title="Assets by Lifecycle State"
          description="Distribution across all asset lifecycle stages."
          accentColor="bg-sky-500"
          action={
            <DrillLink label="View all" to="/assets" count={data.totalAssets} />
          }
        >
          <ChartContainer
            config={Object.fromEntries(
              data.byStatus.map(s => [
                s.status,
                { label: STATUS_LABEL[s.status] ?? s.status, color: STATUS_COLOR[s.status] ?? "#94a3b8" },
              ])
            )}
            className="h-60"
          >
            <BarChart data={statusChartData} layout="vertical" barSize={13} margin={{ left: 8 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis
                dataKey="status" type="category" width={102}
                tickLine={false} axisLine={false} tick={{ fontSize: 11 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {statusChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartCard>

        {/* Asset class — horizontal bars */}
        <ChartCard
          title="Assets by Class"
          description="Breakdown by asset category / hardware class."
          accentColor="bg-violet-500"
        >
          <ChartContainer
            config={{ count: { label: "Assets", color: "var(--chart-2)" } }}
            className="h-60"
          >
            <BarChart data={typeChartData} layout="vertical" barSize={13} margin={{ left: 8 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis
                dataKey="type" type="category" width={120}
                tickLine={false} axisLine={false} tick={{ fontSize: 11 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>

      {/* ── Row 4: Team Ownership + Location ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Team ownership */}
        <ChartCard
          title="Assets by Team"
          description="Which teams own the most assets, and how many are actively deployed."
          accentColor="bg-indigo-500"
          action={<Users className="h-4 w-4 text-muted-foreground" />}
        >
          <ChartContainer
            config={{
              count:  { label: "Total",  color: "var(--chart-1)" },
              active: { label: "Active", color: "var(--chart-3)" },
            }}
            className="h-64"
          >
            <BarChart data={teamChartData} layout="vertical" barSize={12} margin={{ left: 8 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis
                dataKey="name" type="category" width={110}
                tickLine={false} axisLine={false} tick={{ fontSize: 11 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count"  fill="var(--color-count)"  radius={[0, 4, 4, 0]} />
              <Bar dataKey="active" fill="var(--color-active)" radius={[0, 4, 4, 0]} opacity={0.7} />
            </BarChart>
          </ChartContainer>
        </ChartCard>

        {/* Location */}
        <ChartCard
          title="Assets by Location"
          description="Physical distribution across sites and buildings."
          accentColor="bg-teal-500"
          action={<MapPin className="h-4 w-4 text-muted-foreground" />}
        >
          <ChartContainer
            config={{ count: { label: "Assets", color: "var(--chart-4)" } }}
            className="h-64"
          >
            <BarChart data={locationChartData} layout="vertical" barSize={12} margin={{ left: 8 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis
                dataKey="location" type="category" width={120}
                tickLine={false} axisLine={false} tick={{ fontSize: 11 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>

      {/* ── Row 5: Inventory Growth + Retirement Trend ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Inventory growth */}
        <ChartCard
          title="Asset Registration Trend"
          description={`New assets registered per day over the selected period.`}
          accentColor="bg-emerald-500"
        >
          <ChartContainer
            config={{ count: { label: "Registered", color: "var(--chart-3)" } }}
            className="h-44"
          >
            <AreaChart data={data.createdTrend}>
              <defs>
                <linearGradient id="assetGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--chart-3)" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="var(--chart-3)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDay}
                interval={xInterval(data.createdTrend.length)}
                tickLine={false} axisLine={false}
              />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={28} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone" dataKey="count"
                stroke="var(--color-count)" strokeWidth={2}
                fill="url(#assetGradient)"
              />
            </AreaChart>
          </ChartContainer>
        </ChartCard>

        {/* Retired / disposed trend */}
        <ChartCard
          title="Retirement & Disposal Trend"
          description="Assets moved to retired or disposed status per day."
          accentColor="bg-rose-500"
        >
          <ChartContainer
            config={{
              retired:  { label: "Retired",  color: "var(--chart-5)" },
              disposed: { label: "Disposed", color: "var(--chart-1)" },
            }}
            className="h-44"
          >
            <AreaChart data={data.retiredTrend}>
              <defs>
                <linearGradient id="retiredGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--chart-5)" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="var(--chart-5)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDay}
                interval={xInterval(data.retiredTrend.length)}
                tickLine={false} axisLine={false}
              />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={28} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area type="monotone" dataKey="retired"  stroke="var(--color-retired)"  strokeWidth={2} fill="url(#retiredGradient)" />
              <Area type="monotone" dataKey="disposed" stroke="var(--color-disposed)" strokeWidth={2} fill="transparent" strokeDasharray="4 2" />
            </AreaChart>
          </ChartContainer>
        </ChartCard>
      </div>

      {/* ── Row 6: Discovery Health ──────────────────────────────────────────── */}
      {data.managedByDiscovery > 0 && (
        <ChartCard
          title="Discovery Health"
          description="Asset fleet managed by discovery connectors — shows sync coverage vs stale detections."
          accentColor="bg-purple-500"
          action={
            <Button variant="ghost" size="sm" onClick={() => history.pushState(null, "", "/discovery")}
              className="text-xs h-7 gap-1">
              <Radar className="h-3.5 w-3.5" />View Discovery
            </Button>
          }
        >
          <div className="grid grid-cols-3 gap-4 py-2">
            {[
              {
                label: "Managed by Discovery",
                value: data.managedByDiscovery,
                sub:   "total assets with a source",
                color: "text-foreground",
                bg:    "bg-muted/40",
              },
              {
                label: "Recently Discovered",
                value: data.recentlyDiscovered,
                sub:   "seen in the last 7 days",
                color: "text-emerald-600 dark:text-emerald-400",
                bg:    "bg-emerald-500/5",
              },
              {
                label: "Stale Assets",
                value: data.staleAssets,
                sub:   "absent from last sync",
                color: data.staleAssets > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                bg:    data.staleAssets > 0 ? "bg-amber-500/5" : "bg-muted/40",
              },
            ].map(s => (
              <div key={s.label} className={`rounded-lg p-4 ${s.bg}`}>
                <p className="text-xs text-muted-foreground mb-1.5 font-medium">{s.label}</p>
                <p className={`text-3xl font-bold tabular-nums ${s.color}`}>{s.value.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
              </div>
            ))}
          </div>
          {data.staleAssets > 0 && (
            <div className="mt-2 rounded-lg border border-amber-200/60 bg-amber-50/50 dark:bg-amber-900/10 px-4 py-2.5 flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                <strong>{data.staleAssets}</strong> asset{data.staleAssets !== 1 ? "s have" : " has"} been
                flagged stale. Review the Discovery section to investigate or decommission them.
              </span>
            </div>
          )}
        </ChartCard>
      )}

      {/* ── Row 7: Drill-down quick links ────────────────────────────────────── */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-muted-foreground" />
          Quick Drill-Down
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            { label: "deployed assets",    count: data.deployedAssets,           to: "/assets?statuses=deployed",           variant: "default"  },
            { label: "in-use assets",       count: data.inUseAssets,               to: "/assets?statuses=in_use",             variant: "default"  },
            { label: "in stock",            count: data.inStockAssets,             to: "/assets?statuses=in_stock",           variant: "default"  },
            { label: "under maintenance",   count: data.maintenanceAssets,         to: "/assets?statuses=under_maintenance",  variant: "warning"  },
            { label: "warranty expiring",   count: data.warrantyExpiring30,        to: "/assets?warrantyExpiringSoon=true",   variant: "danger"   },
            { label: "stale assets",        count: data.staleAssets,               to: "/assets",                             variant: "warning"  },
            { label: "with open incidents", count: data.assetsWithOpenIncidents,   to: "/assets",                             variant: "danger"   },
            { label: "all contracts",       count: data.contractsExpiring30,       to: "/contracts",                          variant: "warning"  },
          ].map(({ label, count, to, variant }) => (
            <div key={label} className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2.5">
              <DrillLink
                label={label}
                count={count}
                to={to}
                variant={variant as "default" | "warning" | "danger"}
              />
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
