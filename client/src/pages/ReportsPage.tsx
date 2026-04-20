/**
 * DEPRECATED — superseded by the modular reports structure.
 *
 * The reports section now uses sub-routing:
 *   /reports/overview  → client/src/pages/reports/OverviewReport.tsx
 *   /reports/tickets   → client/src/pages/reports/TicketsReport.tsx
 *   /reports/sla       → client/src/pages/reports/SlaReport.tsx
 *   /reports/incidents → client/src/pages/reports/IncidentsReport.tsx
 *   /reports/csat      → client/src/pages/reports/CsatReport.tsx
 *
 * Shared layout: client/src/pages/reports/ReportsLayout.tsx
 * Type-safe API:  client/src/lib/reports/api.ts
 * Response types: client/src/lib/reports/types.ts
 * Utilities:      client/src/lib/reports/utils.ts
 * Components:     client/src/components/reports/
 *
 * This file is no longer imported by App.tsx and can be removed
 * once you are confident nothing else references it.
 */
export {};
