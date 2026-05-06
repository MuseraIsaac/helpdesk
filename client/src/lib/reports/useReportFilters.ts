/**
 * useReportFilters — read the active ticket-domain dimension filters from the
 * URL search params. Memoised by URL state so the returned object is stable
 * across re-renders and is safe to spread into TanStack Query keys.
 *
 * Usage:
 *   const filters = useReportFilters();
 *   const filterKeyParts = filterKey(filters);
 *   useQuery({
 *     queryKey: ["reports", "volume", period, ...filterKeyParts],
 *     queryFn:  () => fetchVolume(period, filters),
 *   });
 */
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import type { ReportFilters } from "./api";

/**
 * Read a fixed list of URL search params into a filter bag.
 * Used by section-specific pages (Incidents, Changes, Problems, etc.) where
 * the filter set differs per section and doesn't fit the generic ticket-domain
 * `ReportFilters` shape.
 *
 * Returns an object whose values are non-empty strings only; missing or empty
 * params are excluded so React Query cache keys remain stable.
 */
export function useReportBag(...keys: string[]): Record<string, string> {
  const [searchParams] = useSearchParams();
  const sp = searchParams.toString();
  return useMemo(() => {
    const bag: Record<string, string> = {};
    for (const k of keys) {
      const v = searchParams.get(k);
      if (v) bag[k] = v;
    }
    return bag;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, keys.join(",")]);
}

export function useReportFilters(): ReportFilters {
  const [searchParams] = useSearchParams();
  // searchParams is a URLSearchParams instance — its identity changes when any
  // param updates, so we can hash by toString() for the memo key.
  const sp = searchParams.toString();
  return useMemo<ReportFilters>(() => {
    const f: ReportFilters = {};
    const get = (key: string) => searchParams.get(key) || undefined;
    f.priority   = get("priority");
    f.category   = get("category");
    f.status     = get("status");
    f.assigneeId = get("assigneeId");
    f.ticketType = get("ticketType");
    f.source     = get("source");
    const teamId = searchParams.get("teamId");
    if (teamId) f.teamId = teamId;
    const orgId = searchParams.get("organizationId");
    if (orgId) f.organizationId = orgId;
    return f;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);
}
