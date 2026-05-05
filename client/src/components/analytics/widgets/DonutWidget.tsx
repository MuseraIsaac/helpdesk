/**
 * DonutWidget — pie/donut visualization for grouped_count results.
 * Center label shows the total or dominant segment.
 */
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { GroupedCountResult } from "@/lib/reports/analytics-types";

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];

const RADIAN = Math.PI / 180;

function CustomLabel({
  cx, cy, midAngle, innerRadius, outerRadius, percent, name,
}: {
  cx: number; cy: number; midAngle: number;
  innerRadius: number; outerRadius: number; percent: number; name: string;
}) {
  if (percent < 0.05) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
      fontSize={10} fontWeight={600}>
      {(percent * 100).toFixed(0)}%
    </text>
  );
}

function CustomTooltip({
  active, payload, total,
}: {
  active?: boolean;
  payload?: { name: string; value: number; payload?: { fill?: string } }[];
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0]!;
  const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0";
  return (
    <div className="bg-popover text-popover-foreground text-[11px] border rounded-md px-2.5 py-1.5 shadow-md min-w-[120px]">
      <div className="flex items-center gap-1.5 mb-0.5">
        <span
          className="h-2 w-2 rounded-sm shrink-0"
          style={{ backgroundColor: item.payload?.fill ?? "hsl(var(--muted-foreground))" }}
        />
        <p className="font-semibold truncate">{item.name}</p>
      </div>
      <p className="text-muted-foreground tabular-nums">
        {item.value.toLocaleString()}
        <span className="ml-1.5 text-foreground/60">· {pct}%</span>
      </p>
    </div>
  );
}

interface Props {
  result: GroupedCountResult;
  height?: number;
}

export function DonutWidget({ result, height = 200 }: Props) {
  const items = result.items.slice(0, 8); // cap at 8 slices
  if (items.length === 0) return null;

  const data = items.map(i => ({ name: i.label, value: i.value }));
  const total = data.reduce((s, d) => s + d.value, 0);

  // Find the dominant slice for the center subtitle — gives the donut a
  // takeaway at a glance instead of just rendering a passive ring.
  const top = data.reduce((b, d) => (d.value > b.value ? d : b), data[0]!);
  const topPct = total > 0 ? Math.round((top.value / total) * 100) : 0;

  return (
    <div className="relative w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius="56%"
            outerRadius="80%"
            paddingAngle={2}
            dataKey="value"
            labelLine={false}
            label={CustomLabel}
            stroke="hsl(var(--background))"
            strokeWidth={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip content={(props) => <CustomTooltip {...props} total={total} />} />
          <Legend
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => (
              <span style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}>{value}</span>
            )}
            wrapperStyle={{ fontSize: 10 }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Center label — total + dominant-slice percentage. Pointer-events-none
          so the donut hover still works through it. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none -mt-3">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          Total
        </span>
        <span className="text-2xl font-bold tabular-nums tracking-tight leading-none mt-0.5">
          {total.toLocaleString()}
        </span>
        {top && total > 0 && (
          <span className="text-[10px] text-muted-foreground/80 mt-1">
            <span className="font-semibold text-foreground/80">{topPct}%</span> {top.name}
          </span>
        )}
      </div>
    </div>
  );
}
