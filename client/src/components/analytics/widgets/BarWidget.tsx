/**
 * BarWidget — handles bar, bar_horizontal, stacked_bar, and histogram.
 *
 * For grouped_count results (most bar charts), one series key is inferred.
 * For stacked_bar, all columns beyond key/label are treated as stacks.
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, LabelList,
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
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
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

  // Show value labels when there's enough space (few categories or wide chart).
  // Histogram bars are dense — skip labels to avoid clutter.
  const showLabels = !isStacked && visualization !== "histogram" && items.length <= 8;

  // Stable gradient ids per chart instance — using the first item's label as a
  // crude unique-ish suffix to avoid collisions when multiple charts share the
  // same DOM. Recharts ignores the SVG defs once detached, so this is safe.
  const gradId = (i: number) => `bar-grad-${visualization}-${i}-${(items[0]?.key ?? "").replace(/[^a-z0-9]/gi, "")}`;

  return (
    <ChartContainer config={config} style={{ height }}>
      <BarChart
        data={data}
        layout={isHorizontal ? "vertical" : "horizontal"}
        barSize={isHorizontal ? 14 : undefined}
        barCategoryGap={visualization === "histogram" ? "4%" : "28%"}
        margin={{ top: showLabels && !isHorizontal ? 16 : 4, right: showLabels && isHorizontal ? 28 : 8, left: isHorizontal ? 0 : -8, bottom: 0 }}
      >
        {/* Per-bar vertical-fade gradients so each bar reads as a polished
            object, not a flat block. Direction depends on layout — vertical
            chart fades top→bottom, horizontal chart fades left→right. */}
        <defs>
          {items.map((_, i) => {
            const c = PALETTE[i % PALETTE.length]!;
            return (
              <linearGradient
                key={i}
                id={gradId(i)}
                x1={isHorizontal ? "0" : "0"}
                y1={isHorizontal ? "0" : "0"}
                x2={isHorizontal ? "1" : "0"}
                y2={isHorizontal ? "0" : "1"}
              >
                <stop offset="0%"   stopColor={c} stopOpacity={0.95} />
                <stop offset="100%" stopColor={c} stopOpacity={0.55} />
              </linearGradient>
            );
          })}
        </defs>

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

        <ChartTooltip
          cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
          content={<ChartTooltipContent />}
        />
        {isStacked && stackKeys.length > 0 && <ChartLegend content={<ChartLegendContent />} />}

        {isStacked && stackKeys.length > 0 ? (
          stackKeys.map((k, i) => (
            <Bar key={k} dataKey={k} stackId="a" fill={`var(--color-${k})`}
              radius={i === stackKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
          ))
        ) : (
          <Bar dataKey="value" radius={isHorizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={`url(#${gradId(i)})`} stroke={PALETTE[i % PALETTE.length]} strokeOpacity={0.4} strokeWidth={0.5} />
            ))}
            {showLabels && (
              <LabelList
                dataKey="value"
                position={isHorizontal ? "right" : "top"}
                fill="hsl(var(--foreground))"
                style={{ fontSize: 10, fontWeight: 600 }}
                offset={6}
              />
            )}
          </Bar>
        )}
      </BarChart>
    </ChartContainer>
  );
}
