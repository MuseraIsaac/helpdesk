import { useQuery } from "@tanstack/react-query";
import { runQuery, type QueryParams } from "@/lib/reports/analytics-api";
import type { AnalyticsQueryResponse } from "@/lib/reports/analytics-types";

/** Fetch a single metric and return the typed response. Skips if metricId is empty. */
export function useMetricQuery(
  widgetId: string,
  params: QueryParams,
  options?: { staleTime?: number; enabled?: boolean },
): {
  data: AnalyticsQueryResponse | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const enabled = (options?.enabled ?? true) && Boolean(params.metricId);

  const { data, isLoading, error, refetch } = useQuery<AnalyticsQueryResponse, Error>({
    queryKey: ["analytics", "widget", widgetId, params],
    queryFn: () => runQuery(params),
    enabled,
    staleTime: options?.staleTime ?? 60_000,
    retry: 1,
  });

  return { data, isLoading, error, refetch };
}
