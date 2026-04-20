import type { ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export type KpiVariant = "default" | "success" | "warning" | "danger" | "info";

export interface KpiTrend {
  direction: "up" | "down" | "neutral";
  label: string;
  upIsGood?: boolean;
}

export interface KpiCardProps {
  title: string;
  value: string | number;
  sub?: string;
  valueClass?: string;
  variant?: KpiVariant;
  trend?: KpiTrend;
  icon?: ReactNode;
}

// ── Variant → visual tokens ───────────────────────────────────────────────────

const VARIANT: Record<KpiVariant, {
  card:   string;
  icon:   string;
  accent: string;
}> = {
  default: {
    card:   "bg-card border-border/60",
    icon:   "bg-muted/60 text-muted-foreground",
    accent: "bg-border/40",
  },
  success: {
    card:   "bg-card border-emerald-500/20",
    icon:   "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    accent: "bg-gradient-to-b from-emerald-500 to-emerald-400",
  },
  warning: {
    card:   "bg-card border-amber-500/20",
    icon:   "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    accent: "bg-gradient-to-b from-amber-500 to-amber-400",
  },
  danger: {
    card:   "bg-card border-rose-500/20",
    icon:   "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    accent: "bg-gradient-to-b from-rose-500 to-rose-400",
  },
  info: {
    card:   "bg-card border-blue-500/20",
    icon:   "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    accent: "bg-gradient-to-b from-blue-500 to-blue-400",
  },
};

// ── Trend badge ───────────────────────────────────────────────────────────────

function TrendBadge({ trend }: { trend: KpiTrend }) {
  const upIsGood = trend.upIsGood ?? true;
  const isGood =
    (trend.direction === "up"   &&  upIsGood) ||
    (trend.direction === "down" && !upIsGood);
  const isBad  =
    (trend.direction === "down" &&  upIsGood) ||
    (trend.direction === "up"   && !upIsGood);

  const Icon =
    trend.direction === "up"   ? TrendingUp  :
    trend.direction === "down" ? TrendingDown :
    Minus;

  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none",
      isGood ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
      isBad  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" :
               "bg-muted text-muted-foreground",
    )}>
      <Icon className="h-2.5 w-2.5" />
      {trend.label}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function KpiCard({ title, value, sub, valueClass, variant = "default", trend, icon }: KpiCardProps) {
  const v = VARIANT[variant];

  return (
    <div className={cn(
      "relative flex items-stretch rounded-xl border overflow-hidden shadow-sm",
      "transition-shadow hover:shadow-md",
      v.card,
    )}>
      {/* Colored accent strip on left */}
      <div className={cn("w-1 shrink-0", v.accent)} />

      <div className="flex-1 px-4 py-3.5 min-w-0">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground leading-none">
            {title}
          </p>
          {icon && (
            <span className={cn("h-6 w-6 rounded-md flex items-center justify-center shrink-0 -mt-0.5 [&_svg]:h-3.5 [&_svg]:w-3.5", v.icon)}>
              {icon}
            </span>
          )}
        </div>

        {/* Value */}
        <p className={cn("text-2xl font-bold tabular-nums leading-none tracking-tight", valueClass)}>
          {value}
        </p>

        {/* Sub-row */}
        {(sub || trend) && (
          <div className="flex items-center gap-2 mt-1.5 min-h-[16px]">
            {trend && <TrendBadge trend={trend} />}
            {sub && (
              <p className="text-[11px] text-muted-foreground leading-none truncate">{sub}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
