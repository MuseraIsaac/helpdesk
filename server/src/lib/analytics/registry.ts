/**
 * Metric registry — single source of truth for all available metrics.
 *
 * To add a new metric:
 *   1. Define it in the appropriate metrics/<domain>.ts file.
 *   2. Import its export array here and spread it into ALL_METRICS.
 *   3. That's it — the engine and /api/analytics/metrics discover it automatically.
 */
import type { MetricDefinition } from "./types";
import { TICKET_METRICS }   from "./metrics/tickets";
import { INCIDENT_METRICS } from "./metrics/incidents";
import { REQUEST_METRICS }  from "./metrics/requests";
import { PROBLEM_METRICS }  from "./metrics/problems";
import { CHANGE_METRICS }   from "./metrics/changes";
import { APPROVAL_METRICS } from "./metrics/approvals";
import { CSAT_METRICS }     from "./metrics/csat";
import { AGENT_METRICS }    from "./metrics/agent";
import { TEAM_METRICS }     from "./metrics/team";
import { KB_METRICS }       from "./metrics/kb";
import { REALTIME_METRICS } from "./metrics/realtime";

// ── Registry ──────────────────────────────────────────────────────────────────

const ALL_METRICS: MetricDefinition[] = [
  ...TICKET_METRICS,
  ...INCIDENT_METRICS,
  ...REQUEST_METRICS,
  ...PROBLEM_METRICS,
  ...CHANGE_METRICS,
  ...APPROVAL_METRICS,
  ...CSAT_METRICS,
  ...AGENT_METRICS,
  ...TEAM_METRICS,
  ...KB_METRICS,
  ...REALTIME_METRICS,
];

/** metricId → MetricDefinition lookup map. */
export const METRIC_REGISTRY = new Map<string, MetricDefinition>(
  ALL_METRICS.map(m => [m.id, m]),
);

/** All metric definitions as a flat array (for listing endpoints). */
export function listMetrics(domain?: string): MetricDefinition[] {
  if (!domain) return ALL_METRICS;
  return ALL_METRICS.filter(m => m.domain === domain);
}

/** Look up a single metric by ID. Returns undefined if not found. */
export function getMetric(id: string): MetricDefinition | undefined {
  return METRIC_REGISTRY.get(id);
}

/**
 * Metadata-only shape for the /api/analytics/metrics listing endpoint.
 * Omits the computeFor functions which are server-only.
 */
export interface MetricMeta {
  id: string;
  label: string;
  description: string;
  domain: string;
  unit?: string;
  supportedVisualizations: string[];
  defaultVisualization: string;
  supportedGroupBys?: string[];
  filterFields?: MetricDefinition["filterFields"];
}

export function toMetricMeta(m: MetricDefinition): MetricMeta {
  return {
    id:                      m.id,
    label:                   m.label,
    description:             m.description,
    domain:                  m.domain,
    unit:                    m.unit,
    supportedVisualizations: m.supportedVisualizations,
    defaultVisualization:    m.defaultVisualization,
    supportedGroupBys:       m.supportedGroupBys,
    filterFields:            m.filterFields,
  };
}
