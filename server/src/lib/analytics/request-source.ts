/**
 * Unified service-request data source.
 *
 * "Service request" lives in two places now:
 *   1. service_request table — standalone requests submitted by internal
 *      agents or by customers via the portal.
 *   2. ticket table where ticketType = 'service_request' — agent-created
 *      tickets classified as a request. Previously these were mirrored
 *      into a separate ServiceRequest row; that auto-mirroring is gone
 *      (see routes/tickets.ts), so the ticket itself is the canonical
 *      record.
 *
 * Every metric / report that totals "service requests" must aggregate
 * both surfaces. This module exports a single SQL CTE — REQUEST_UNION_CTE
 * — that projects both into a common shape so the downstream queries can
 * stay simple. Use it as the FROM clause in any analytics query.
 *
 * Common shape:
 *   id              text       — prefixed ('sr_'/'tk_') so cross-source ids never collide
 *   source          text       — 'service_request' | 'ticket'
 *   created_at      timestamptz
 *   resolved_at     timestamptz — terminal time (resolved or closed)
 *   sla_breached    boolean
 *   sla_due_at      timestamptz
 *   status          text       — normalised: open / in_progress / resolved / closed / cancelled
 *   catalog_item    text       — null for ticket-source rows
 *   priority        text
 *   assigned_to_id  text
 */

/**
 * SQL CTE that unions service_request rows with ticket rows of type
 * 'service_request'. Inline this fragment into a query like:
 *
 *   `WITH ${REQUEST_UNION_CTE} SELECT … FROM unified_requests …`
 *
 * The CTE has no parameter placeholders — date filtering is applied by
 * the outer query against `created_at`.
 */
export const REQUEST_UNION_CTE = `
unified_requests AS (
  SELECT
    'sr_' || id::text                        AS id,
    'service_request'                        AS source,
    "createdAt"                              AS created_at,
    COALESCE("resolved_at", "closed_at")     AS resolved_at,
    "sla_breached"                           AS sla_breached,
    "sla_due_at"                             AS sla_due_at,
    status::text                             AS status,
    "catalog_item_name"                      AS catalog_item,
    priority::text                           AS priority,
    "assigned_to_id"                         AS assigned_to_id
  FROM service_request
  UNION ALL
  SELECT
    'tk_' || id::text                        AS id,
    'ticket'                                 AS source,
    "createdAt"                              AS created_at,
    "resolvedAt"                             AS resolved_at,
    "slaBreached"                            AS sla_breached,
    "resolutionDueAt"                        AS sla_due_at,
    status::text                             AS status,
    NULL::text                               AS catalog_item,
    priority::text                           AS priority,
    "assignedToId"                           AS assigned_to_id
  FROM ticket
  WHERE "ticketType" = 'service_request'
    AND status NOT IN ('new','processing')
)`;
