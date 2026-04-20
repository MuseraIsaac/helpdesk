/**
 * DonutWidget — pie/donut visualization for grouped_count results.
 * Center label shows the total or dominant segment.
 */
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { GroupedCountResult } from "@/lib/reports/analytics-types";

const PALETTE = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
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

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="bg-popover text-popover-foreground text-[11px] border rounded-md px-2.5 py-1.5 shadow-md">
      <p className="font-semibold">{item.name}</p>
      <p className="text-muted-foreground tabular-nums">{item.value.toLocaleString()}</p>
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

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius="52%"
          outerRadius="78%"
          paddingAngle={2}
          dataKey="value"
          labelLine={false}
          label={CustomLabel}
          strokeWidth={0}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
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
  );
}
