import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorAlert from "@/components/ErrorAlert";
import KpiCard from "@/components/reports/KpiCard";
import ChartCard from "@/components/reports/ChartCard";
import ReportLoading from "@/components/reports/ReportLoading";
import {
  fetchVolume,
  fetchBacklogTrend,
  fetchBreakdowns,
  fetchResolutionDistribution,
  fetchFcr,
} from "@/lib/reports/api";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { fmtDay, fmtPct, xInterval, periodToRange, rangeQS } from "@/lib/reports/utils";

function buildPrevVolumePeriod(period: string): string {
  const range = periodToRange(period);
  const fromMs = new Date(range.from).getTime();
  const toMs   = new Date(range.to).getTime();
  const spanMs = toMs - fromMs + 86_400_000;
  const prevTo  = new Date(fromMs - 86_400_000).toISOString().slice(0, 10);
  const prevFrom= new Date(fromMs - spanMs).toISOString().slice(0, 10);
  return rangeQS({ from: prevFrom, to: prevTo });
}

export default function TicketsReport() {
  const [searchParams] = useSearchParams();
  const period = searchParams.get("period") ?? "30";
  const navigate = useNavigate();
  const [overlay, setOverlay] = useState(false);

  function drillPriority(entry: { priority?: string }) {
    if (entry.priority) navigate(`/tickets?priority=${entry.priority}`);
  }
  function drillCategory(entry: { category?: string }) {
    if (entry.category) navigate(`/tickets?category=${entry.category}`);
  }

  const { data: volPoints, isLoading: loadingVol } = useQuery({
    queryKey: ["reports", "volume", period],
    queryFn: () => fetchVolume(period),
  });

  const { data: blPoints, isLoading: loadingBacklog } = useQuery({
    queryKey: ["reports", "backlog", period],
    queryFn: () => fetchBacklogTrend(period),
  });

  const {
    data: breakdown, isLoading: loadingBd, error: bdErr,
  } = useQuery({
    queryKey: ["reports", "breakdowns", period],
    queryFn: () => fetchBreakdowns(period),
  });

  const { data: resBuckets, isLoading: loadingResDist } = useQuery({
    queryKey: ["reports", "res-dist", period],
    queryFn: () => fetchResolutionDistribution(period),
  });

  const { data: fcr, isLoading: loadingFcr } = useQuery({
    queryKey: ["reports", "fcr", period],
    queryFn: () => fetchFcr(period),
  });

  const prevVolumeQS = buildPrevVolumePeriod(period);
  const { data: prevVolPoints } = useQuery({
    queryKey: ["reports", "volume-prev", period],
    queryFn: () => fetchVolume(prevVolumeQS),
    enabled: overlay,
    staleTime: 120_000,
  });

  if (loadingVol || loadingBd) return <ReportLoading kpiCount={2} chartCount={3} />;
  if (bdErr) return <ErrorAlert error={bdErr as Error} fallback="Failed to load ticket data" />;

  const vol    = volPoints ?? [];

  // Merge current + previous period into a day-indexed form for overlay
  const mergedVol = (() => {
    if (!overlay || !prevVolPoints) return vol;
    const prevByIndex = new Map(prevVolPoints.map((p, i) => [i, p.tickets]));
    return vol.map((p, i) => ({
      ...p,
      prevTickets: prevByIndex.get(i) ?? null,
    }));
  })();
  const bl     = blPoints  ?? [];
  const byPri  = breakdown?.byPriority ?? [];
  const byCat  = (breakdown?.byCategory ?? []).slice(0, 8);
  const resDist = resBuckets ?? [];

  return (
    <div className="space-y-6">
      {/* ── Volume line + FCR side cards ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3">
          <ChartCard
            title="Ticket Volume"
            description="New tickets created per day for the selected period."
            accentColor="bg-violet-500"
            action={
              <div className="flex items-center gap-1.5">
                <Label htmlFor="overlay-toggle" className="text-[11px] text-muted-foreground cursor-pointer whitespace-nowrap">
                  vs prev period
                </Label>
                <Switch
                  id="overlay-toggle"
                  checked={overlay}
                  onCheckedChange={setOverlay}
                  className="scale-75"
                />
              </div>
            }
          >
            <ChartContainer
              config={{
                tickets:     { label: "Current",  color: "var(--chart-1)" },
                prevTickets: { label: "Previous", color: "var(--chart-3)" },
              }}
              className="h-48"
            >
              <LineChart data={overlay ? mergedVol : vol}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDay}
                  interval={xInterval((vol).length)}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                <ChartTooltip content={<ChartTooltipContent />} />
                {overlay && <ChartLegend content={<ChartLegendContent />} />}
                <Line
                  type="monotone"
                  dataKey="tickets"
                  name="Current"
                  stroke="var(--color-tickets)"
                  strokeWidth={2}
                  dot={false}
                />
                {overlay && (
                  <Line
                    type="monotone"
                    dataKey="prevTickets"
                    name="Previous"
                    stroke="var(--color-prevTickets)"
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                    dot={false}
                    connectNulls={false}
                  />
                )}
              </LineChart>
            </ChartContainer>
          </ChartCard>
        </div>

        <div className="flex flex-col gap-4">
          {loadingFcr ? (
            <><Skeleton className="h-[88px]" /><Skeleton className="h-[88px]" /></>
          ) : (
            <>
              <KpiCard
                title="First Contact Resolution"
                value={fmtPct(fcr?.rate ?? null)}
                sub={`${fcr?.firstContact ?? 0} of ${fcr?.total ?? 0} resolved`}
                valueClass="text-green-600 dark:text-green-400"
              />
              <KpiCard
                title="Multi-contact"
                value={(fcr?.multiContact ?? 0).toLocaleString()}
                sub="required follow-up"
              />
            </>
          )}
        </div>
      </div>

      {/* ── Opened vs closed (backlog trend) ────────────────────────────── */}
      <ChartCard
        title="Opened vs Closed"
        description="When opened > closed the backlog is growing; when closed > opened it is shrinking."
        accentColor="bg-sky-500"
      >
        {loadingBacklog ? (
          <Skeleton className="h-48" />
        ) : (
          <ChartContainer
            config={{
              opened: { label: "Opened", color: "var(--chart-1)" },
              closed: { label: "Closed",  color: "var(--chart-2)" },
            }}
            className="h-48"
          >
            <LineChart data={bl}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDay}
                interval={xInterval(bl.length)}
                tickLine={false}
                axisLine={false}
              />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={32} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line type="monotone" dataKey="opened" stroke="var(--color-opened)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="closed"  stroke="var(--color-closed)"  strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        )}
      </ChartCard>

      {/* ── Priority and Category breakdowns ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="By Priority" description="Click a bar to filter the ticket list by that priority." accentColor="bg-orange-500">
          <ChartContainer
            config={{
              total: { label: "Total", color: "var(--chart-1)" },
              open:  { label: "Open",  color: "var(--chart-3)" },
            }}
            className="h-48"
          >
            <BarChart
              data={byPri} layout="vertical" barSize={12} barCategoryGap="30%"
              onClick={d => d?.activePayload?.[0] && drillPriority(d.activePayload[0].payload)}
              style={{ cursor: "pointer" }}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis
                dataKey="label"
                type="category"
                width={64}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="total" fill="var(--color-total)" radius={[0, 4, 4, 0]} />
              <Bar dataKey="open"  fill="var(--color-open)"  radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        </ChartCard>

        <ChartCard title="By Category" description="Top 8 categories · click to filter ticket list." accentColor="bg-teal-500">
          <ChartContainer
            config={{ total: { label: "Total", color: "var(--chart-1)" } }}
            className="h-48"
          >
            <BarChart
              data={byCat} layout="vertical" barSize={12}
              onClick={d => d?.activePayload?.[0] && drillCategory(d.activePayload[0].payload)}
              style={{ cursor: "pointer" }}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis
                dataKey="label"
                type="category"
                width={96}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="total" fill="var(--color-total)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>

      {/* ── Resolution time distribution ─────────────────────────────────── */}
      <ChartCard
        title="Resolution Time Distribution"
        description="How long resolved tickets took to close. Helps identify workflow bottlenecks."
        accentColor="bg-indigo-500"
      >
        {loadingResDist ? (
          <Skeleton className="h-44" />
        ) : (
          <ChartContainer
            config={{ count: { label: "Tickets", color: "var(--chart-1)" } }}
            className="h-44"
          >
            <BarChart data={resDist}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={32} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </ChartCard>
    </div>
  );
}
