/**
 * BarWidget — handles bar, bar_horizontal, stacked_bar, and histogram.
 *
 * For grouped_count results (most bar charts), one series key is inferred.
 * For stacked_bar, all columns beyond key/label are treated as stacks.
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, ReferenceLine,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import type { GroupedCountResult, DistributionResult } from "@/lib/reports/analytics-types";

const PALETTE = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

interface BarProps {
  result: GroupedCountResult | DistributionResult;
  visualization: "bar" | "bar_horizontal" | "stacked_bar" | "histogram";
  height?: number;
}

export function BarWidget({ result, visualization, height = 200 }: BarProps) {
  // Normalize both result types to a flat items array
  const items: { key: string; label: string; value: number }[] =
    result.type === "distribution"
      ? result.buckets.map(b => ({ key: b.bucket, label: b.label, value: b.count }))
      : result.items;

  if (items.length === 0) return null;

  const isHorizontal = visualization === "bar_horizontal";
  const isStacked = visualization === "stacked_bar";

  // For stacked_bar, detect extra columns from first item if GroupedCountResult
  const stackKeys: string[] =
    isStacked && result.type === "grouped_count" && result.items.length > 0
      ? Object.keys(result.items[0]).filter(k => k !== "key" && k !== "label" && k !== "value")
      : [];

  const config =
    stackKeys.length > 0
      ? Object.fromEntries(
          stackKeys.map((k, i) => [k, { label: k, color: PALETTE[i % PALETTE.length] }]),
        )
      : { value: { label: "Count", color: PALETTE[0] } };

  const data = items.map(item => ({
    ...item,
    ...(isStacked && result.type === "grouped_count"
      ? result.items.find(i => i.key === item.key) ?? {}
      : {}),
  }));

  const maxLabelLen = Math.max(...items.map(i => i.label.length));
  const yAxisWidth  = isHorizontal ? Math.min(maxLabelLen * 6.5 + 8, 140) : 36;

  return (
    <ChartContainer config={config} style={{ height }}>
      <BarChart
        data={data}
        layout={isHorizontal ? "vertical" : "horizontal"}
        barSize={isHorizontal ? 11 : undefined}
        barCategoryGap={visualization === "histogram" ? "4%" : "30%"}
        margin={{ top: 4, right: 8, left: isHorizontal ? 0 : -8, bottom: 0 }}
      >
        <CartesianGrid
          vertical={isHorizontal}
          horizontal={!isHorizontal}
          strokeDasharray="3 3"
          className="stroke-border/60"
        />

        {isHorizontal ? (
          <>
            <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis dataKey="label" type="category" width={yAxisWidth} tickLine={false} axisLine={false}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" tickLine={false} axisLine={false}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} dy={4} />
            <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={yAxisWidth}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
          </>
        )}

        <ChartTooltip content={<ChartTooltipContent />} />
        {isStacked && stackKeys.length > 0 && <ChartLegend content={<ChartLegendContent />} />}

        {isStacked && stackKeys.length > 0 ? (
          stackKeys.map((k, i) => (
            <Bar key={k} dataKey={k} stackId="a" fill={`var(--color-${k})`}
              radius={i === stackKeys.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
          ))
        ) : (
          <Bar dataKey="value" radius={isHorizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Bar>
        )}
      </BarChart>
    </ChartContainer>
  );
}
