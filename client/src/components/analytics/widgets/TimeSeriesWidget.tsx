/**
 * TimeSeriesWidget — line and area charts for time_series result type.
 *
 * Uses ChartContainer from shadcn/ui for consistent theming and
 * CSS variable–based colors (--color-<key>).
 */
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import type { TimeSeriesResult } from "@/lib/reports/analytics-types";

// Shadcn chart-N CSS variables cycle
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

function shortDate(d: string): string {
  const [, m, day] = d.split("-");
  return `${+m}/${+day}`;
}

function tickInterval(count: number): number {
  if (count <= 8)  return 0;
  if (count <= 14) return 1;
  if (count <= 30) return 3;
  if (count <= 60) return 6;
  return Math.floor(count / 10);
}

interface Props {
  result: TimeSeriesResult;
  visualization: "line" | "area";
  height?: number;
}

export function TimeSeriesWidget({ result, visualization, height = 200 }: Props) {
  const { series, points } = result;
  if (points.length === 0) return null;

  // Build shadcn chart config
  const config = Object.fromEntries(
    series.map((s, i) => [s.key, { label: s.label, color: PALETTE[i % PALETTE.length] }]),
  );

  const showLegend = series.length > 1;
  const chartH = showLegend ? height - 28 : height;
  const interval = tickInterval(points.length);

  const Chart = visualization === "area" ? AreaChart : LineChart;
  const DataComp = visualization === "area" ? Area : Line;

  return (
    <ChartContainer config={config} style={{ height: chartH }}>
      <Chart data={points} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.18} />
              <stop offset="95%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.01} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/60" />
        <XAxis
          dataKey="date"
          tickFormatter={shortDate}
          interval={interval}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          dy={4}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={32}
          allowDecimals={false}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        {showLegend && <ChartLegend content={<ChartLegendContent />} />}

        {series.map((s, i) =>
          visualization === "area" ? (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={`var(--color-${s.key})`}
              strokeWidth={1.75}
              fill={`url(#grad-${s.key})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          ) : (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={`var(--color-${s.key})`}
              strokeWidth={1.75}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          ),
        )}
      </Chart>
    </ChartContainer>
  );
}
