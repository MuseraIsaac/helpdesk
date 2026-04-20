# Curated Reports & Analytics Reference

This document describes every curated report section, every widget type available in the analytics system, and the gaps still remaining for future enterprise parity.

---

## Curated Report Sections

Each section lives at `/reports/<section>` and shares the period filter in the top bar (Last 7 / 30 / 90 days, This Month, Last Month). The **Real-time** and **Library** sections ignore the period filter.

---

### 1. Overview (`/reports/overview`)

The executive summary for the service desk. Uses the legacy `/api/reports/*` endpoints for high-performance single-query aggregation.

| Widget | Type | Description |
|--------|------|-------------|
| Total Tickets | KPI card | Count of all visible tickets in the period |
| Open | KPI card | Currently open ticket count (warning colour > 50) |
| Resolved | KPI card (success) | Resolved tickets in the period |
| AI Auto-resolved | KPI card (info) | % and count of AI-resolved tickets |
| SLA Compliance | KPI card (traffic-light) | % compliant; green ≥ 90%, amber ≥ 70%, red < 70% |
| Avg First Response | KPI card | Mean seconds from creation to first agent reply |
| Avg Resolution Time | KPI card | Mean seconds from creation to resolution |
| Escalated | KPI card | Escalated + reopened counts |
| Priority Distribution | Donut chart | Tickets by priority (urgent/high/medium/low/unset) |
| Status Distribution | Donut chart | Tickets by status (open/in_progress/resolved/closed) |
| Open Ticket Age | Bar chart | Live snapshot of open tickets bucketed by age (<24h, 1–3d, 3–7d, >7d) |
| Longest-Waiting Open | Table | 10 oldest open tickets with SLA breach flag |

---

### 2. Tickets (`/reports/tickets`)

Volume, backlog, and quality metrics for the ticket pipeline.

| Widget | Type | Description |
|--------|------|-------------|
| Total / Open / FCR | KPI cards | Core volume and first-contact resolution rate |
| Ticket Volume | Line chart | Daily ticket creation count |
| Opened vs Closed | Line chart | Backlog growth/shrinkage trend |
| By Priority | Horizontal bar | Ticket count per priority level |
| By Category | Horizontal bar | Ticket count per support category |
| Resolution Distribution | Histogram | How long resolved tickets took (<1h, 1–4h, 4–8h, 8–24h, 1–3d, 3–7d, >7d) |

---

### 3. SLA (`/reports/sla`)

SLA health across all dimensions with live health KPIs at the top.

| Widget | Type | Description |
|--------|------|-------------|
| SLA Compliance | KPI card (traffic-light) | Overall % compliance for the period |
| Breached Open | KPI card (danger/success) | Live count of open tickets past their SLA deadline |
| At SLA Risk | KPI card (warning/success) | Live count of open tickets with deadline within 2 hours |
| On Track | KPI card (success) | Open tickets with comfortable SLA headroom |
| SLA by Priority | Table | Compliance rate per priority level |
| SLA by Category | Table | Compliance rate per ticket category |
| SLA by Team | Table | Compliance rate per queue/team |
| Agent Leaderboard | Table | Top agents by resolved count + avg resolution + SLA % (requires `reports.advanced_view`) |

---

### 4. Agents (`/reports/agents`)

Per-agent performance breakdown using the analytics batch engine.

| Widget | Type | Description |
|--------|------|-------------|
| Tickets Resolved | Leaderboard table | Agents ranked by resolved count with still-open column |
| Current Workload | Leaderboard table | Live open + in-progress tickets per agent |
| Avg Resolution Time | Leaderboard table | Fastest resolvers first (formatted duration) |
| Avg First Response Time | Leaderboard table | Fastest first-responders first |
| CSAT Score by Agent | Leaderboard table | Average satisfaction rating (1–5) per agent |
| SLA Compliance by Agent | Leaderboard table | SLA compliance % ranked best-to-worst |
| First Contact Resolution | Leaderboard table | FCR % per agent |

---

### 5. Teams (`/reports/teams`)

Per-team metrics mirroring the agent view at queue level.

| Widget | Type | Description |
|--------|------|-------------|
| Tickets Resolved by Team | Leaderboard table | Teams ranked by resolved count |
| Queue Depth (Live) | Leaderboard table | Currently open tickets per team |
| Avg Resolution Time by Team | Leaderboard table | Fastest resolving teams first |
| Avg First Response by Team | Leaderboard table | Fastest responding teams first |
| SLA Compliance by Team | Leaderboard table | SLA % per team |
| CSAT Score by Team | Leaderboard table | Avg satisfaction per team |

---

### 6. Incidents (`/reports/incidents`)

Incident lifecycle — volume, MTTA, MTTR, and breakdowns.

| Widget | Type | Description |
|--------|------|-------------|
| Total / Major / MTTA / MTTR | KPI cards | Core incident KPIs |
| Incident Volume | Area chart | Daily incident creation trend |
| By Status | Bar chart | Incident count per status |
| By Priority | Bar chart | Incident count per priority level |

---

### 7. CSAT (`/reports/csat`)

Customer satisfaction scoring with both aggregate and distribution views.

| Widget | Type | Description |
|--------|------|-------------|
| Avg CSAT Score | KPI card (traffic-light) | Mean rating (1–5); green ≥ 4, amber ≥ 3, red < 3 |
| Total Ratings | KPI card | Total survey responses in the period |
| Days with Ratings | KPI card | Days with at least one response |
| Coverage | KPI card | % of period days with ratings (green ≥ 60%, amber ≥ 30%) |
| Rating Breakdown | Horizontal bar (1–5) | Animated distribution of star ratings, red → green |
| Daily CSAT Trend | Line chart | Mean daily rating with gaps for no-response days |

---

### 8. Knowledge Base (`/reports/kb`)

KB article health, helpfulness, and usage.

| Widget | Type | Description |
|--------|------|-------------|
| Published Articles | KPI card | Count of live articles |
| Total Views | KPI card | Sum of viewCount across all published articles |
| Helpful Vote Ratio | KPI card | % of votes marked helpful in the period |
| Feedback Trend | Line chart | Daily helpful vs. not-helpful votes |
| Articles Published | Bar chart | Daily publish count |
| Top Articles by Views | Leaderboard table | Most viewed with helpful count |
| Most Helpful Articles | Leaderboard table | Ranked by helpful vote ratio |

---

### 9. Real-time (`/reports/realtime`)

Live operations snapshot — no period filter, auto-refreshes every 60 seconds.

| Widget | Type | Description |
|--------|------|-------------|
| Open Tickets | KPI card | Current open + in-progress count |
| Unassigned | KPI card (danger if > 5) | Open tickets without an agent |
| SLA Overdue | KPI card (danger if > 0) | Open tickets past their SLA deadline |
| At SLA Risk | KPI card (warning if > 0) | Open tickets with deadline within 2 hours |
| No Agent Reply | KPI card (warning if > 5) | Assigned open tickets with zero agent replies |
| Active Incidents | KPI card (danger if > 0) | Non-resolved incidents |
| Pending Approvals | KPI card | Approval requests awaiting decision |
| Changes In Progress | KPI card | Changes in the implement phase |
| Open Problems | KPI card | Non-resolved problems |
| Open Requests | KPI card | Non-fulfilled service requests |
| Agent Workload (Live) | Table | Open + in-progress per agent, badge turns red > 10 |

---

### 10. Library (`/reports/library`)

Browse, open, edit, clone, and delete all saved + curated custom reports.

| Feature | Description |
|---------|-------------|
| Curated reports list | System reports marked read-only with a `Clone` button |
| My Reports list | Personal saved reports with Open / Edit / Clone / Delete |
| Clone curated | Creates a personal copy via `POST /api/analytics/reports/:id/clone` |
| New Report link | Opens the custom report builder at `/reports/custom` |

---

## Dashboard Templates

Four named templates are available via the **"From Template"** button on the home dashboard.

| Template | Widgets | Best For |
|----------|---------|----------|
| **Service Desk Overview** | Volume KPIs, SLA table, daily volume bar, backlog trend, priority/channel breakdown, CSAT, top-open table | Day-to-day service desk command center |
| **ITSM Operations** | Incident analytics, request fulfillment, problem recurrence, approval turnaround, ticket volume, SLA | IT operations managers |
| **Manager View** | Performance KPIs, CSAT trend, FCR rate, SLA dimension tables, resolution histogram, agent leaderboard | Directors and team leads |
| **Agent Performance** | Agent leaderboard, by-assignee table, resolution distribution, CSAT trend, backlog trend, FCR rate | Support team supervisors |

Templates are served by `GET /api/dashboards/templates` and applied via `POST /api/dashboards`.

---

## Widget Types Added in This Release

| Widget Type | Description | Used In |
|-------------|-------------|---------|
| `KpiCard` with `variant` | Left-border accent (success/warning/danger/info) with trend badge | All report KPIs |
| `KpiCard` with `icon` | Lucide icon in top-right corner | Overview, SLA, Realtime |
| `KpiCard` with `trend` | Up/down/neutral badge with % label | Future use (comparison mode) |
| Rating Breakdown bars | Animated horizontal bars per star level, red→green | CSAT |
| Priority Distribution donut | Semantic priority colours | Overview |
| Status Distribution donut | Semantic status colours | Overview |
| Live health KPIs | Four operational-health stats from single DB query | SLA, Realtime |
| Operational health endpoint | `/api/reports/operational-health` — single-pass aggregate | SLA, Realtime |

---

## New Analytics Metrics (Server)

| Metric ID | Domain | Type | Description |
|-----------|--------|------|-------------|
| `tickets.status_distribution` | tickets | grouped_count | Tickets by status for the period |
| `tickets.priority_distribution` | tickets | grouped_count | Tickets by priority for the period |
| `tickets.by_team` | tickets | grouped_count | Tickets by queue/team |
| `tickets.by_agent` | tickets | grouped_count + leaderboard | Tickets by assigned agent |
| `tickets.overdue` | tickets | stat (live) | Open tickets past SLA deadline |
| `tickets.assigned_not_replied` | tickets | stat (live) | Assigned open tickets with zero agent replies |
| `realtime.overdue_tickets` | realtime | stat (live) | Same as tickets.overdue, in realtime domain |
| `realtime.assigned_not_replied` | realtime | stat (live) | Same as tickets.assigned_not_replied, in realtime domain |

---

## Endpoints Added

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/reports/csat-breakdown` | Star-level CSAT distribution with pct share |
| `GET` | `/api/reports/operational-health` | Live health snapshot (open, unassigned, overdue, at-risk, assigned-not-replied) |
| `POST` | `/api/analytics/reports/:id/clone` | Clone any visible or curated saved report |
| `GET` | `/api/dashboards/templates` | List predefined dashboard template configs |

---

## Gaps Remaining — Future Enterprise Parity

| Gap | Notes |
|-----|-------|
| **Custom date range picker in ReportsLayout** | Currently limited to preset periods (7/30/90 days, this/last month). Full calendar range picker not yet wired. |
| **Drill-down from charts** | Leaderboard and data-table `onRowClick` hooks exist but no destination page is configured (e.g. click agent → agent detail page). |
| **Scheduled report delivery** | `ReportSchedule` schema and CRUD exists; no pg-boss job to actually execute and email them. |
| **XLSX export** | Export endpoint returns JSON fallback; requires adding `xlsx` / `exceljs` package. |
| **Comparative period mode** | `compareWithPrevious` flag exists in analytics engine; `stat_change` result type is rendered by `StatWidget` but no UI exposes it in curated reports. |
| **Custom report templates from DB** | Curated `SavedReport` records aren't seeded; templates are only dashboard configs. Add a seed script for curated SavedReport entries. |
| **Real-time WebSocket push** | Realtime report polls every 60 s; Server-Sent Events or WebSocket would give true live updates without polling overhead. |
| **Reports Phase 2–4** (Requests, Problems, Approvals, Changes analytics pages) | Backend data exists; frontend report tabs are placeholders. |
| **Materialized views / query cache** | All analytics queries compute on-the-fly. For high-volume deployments, pre-aggregated materialized views would dramatically reduce query time. |
| **KB search analytics** | No query logs for KB search; can't track what customers searched for and didn't find. |
| **Ticket merge analytics** | Merged/child tickets excluded from some aggregations; no dedicated merge-rate metric. |
| **Multi-period overlay charts** | No way to display "this month vs last month" overlaid on the same chart in curated views. |
| **Agent-level SLA breach notifications** | SLA breach detected but no automated notification to assigned agent or manager. |
